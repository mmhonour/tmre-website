import 'server-only'

import { execute, query } from '@/lib/db/postgres'
import { listingRowId, readListingByIdFromDb } from '@/lib/db/listings-repo'
import { streetsMatch } from '@/lib/listing-history'
import { persistListingByMlsId, persistListingRecord } from '@/lib/listings-store'
import {
  normalizePropertyAddress,
  streetSearchVariants,
} from '@/lib/property-address'
import { getListingByMlsId, searchListings, type Listing } from '@/lib/rets'
import type { VisionAddressRecord } from '@/lib/db/vision-addresses-repo'
import { visionListingKeys } from '@/lib/vision-listing-match'

const WESTPORT = 'Westport'

const INGEST_TIMEOUT_MS = 12_000

export type FindListingIngestResult = {
  listing: Listing | null
  /** True only when this request wrote a new/updated listings row from RETS. */
  ingested: boolean
}

function uniqueIds(...raw: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const id = value?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function stampVisionListingLink(
  vision: VisionAddressRecord,
  listing: Listing,
): Promise<void> {
  const id = listingRowId(listing)
  if (!id) return
  try {
    await execute(
      `UPDATE listings
          SET vision_pid = $2
        WHERE id = $1
          AND (vision_pid IS NULL OR vision_pid = '')`,
      [id, vision.visionPid],
    )
    await execute(
      `UPDATE vision_addresses
          SET listing_id = $3, mls_id = COALESCE($4, mls_id)
        WHERE town = $1 AND vision_pid = $2`,
      [
        WESTPORT,
        vision.visionPid,
        id,
        listing.mlsId?.trim() || null,
      ],
    )
  } catch (err) {
    console.warn('[find-listing-ingest] vision link skipped', err)
  }
}

async function persistByKnownId(id: string): Promise<Listing | null> {
  const result = await withTimeout(persistListingByMlsId(id), INGEST_TIMEOUT_MS)
  if (!result?.found) return null
  return readListingByIdFromDb(id)
}

function visionStreetLine(vision: VisionAddressRecord): string {
  return (
    [vision.streetNo, vision.streetName].filter(Boolean).join(' ').trim() ||
    vision.addressFull?.split(',')[0]?.trim() ||
    ''
  )
}

/**
 * Neon listings already at this Vision address (Ln↔Lane / Rd↔Road via
 * addressMatchKey). Same stack as backfillVisionListingLinks — Find used
 * to skip this and only RETS-search the Vision spelling (`*Locust*Ln*`),
 * which cannot match MLS `Locust Lane`.
 */
export async function findListingInDbByVisionAddress(
  vision: VisionAddressRecord,
): Promise<Listing | null> {
  const street = visionStreetLine(vision)
  if (street.length < 4) return null
  const sourceNorm =
    vision.addressNorm ||
    normalizePropertyAddress(WESTPORT, street, vision.zip ?? null)
  const want = visionListingKeys(sourceNorm)
  const house = (vision.streetNo || street.match(/^\d+[A-Za-z]?/)?.[0] || '').trim()
  if (!house) return null

  const rows = await query<{
    id: string
    address_street: string | null
    postal_code: string | null
  }>(
    `SELECT id, address_street, postal_code
       FROM listings
      WHERE lower(town) = lower($1)
        AND address_street ILIKE $2
      ORDER BY
        CASE status_bucket
          WHEN 'Active' THEN 0
          WHEN 'Closed' THEN 1
          WHEN 'Expired' THEN 2
          ELSE 3
        END,
        modification_timestamp DESC NULLS LAST
      LIMIT 40`,
    [WESTPORT, `${house} %`],
  )

  for (const row of rows) {
    const listingStreet = row.address_street?.trim()
    if (!listingStreet) continue
    const keys = visionListingKeys(
      normalizePropertyAddress(WESTPORT, listingStreet, row.postal_code),
    )
    if (keys.exact !== want.exact && keys.loose !== want.loose) continue
    const listing = await readListingByIdFromDb(row.id)
    if (listing) return listing
  }
  return null
}

async function persistByStreet(street: string): Promise<Listing | null> {
  const hits: Listing[] = []
  for (const variant of streetSearchVariants(street)) {
    const batch = await withTimeout(
      searchListings({
        county: 'fairfield',
        city: WESTPORT,
        addressContains: variant,
        limit: 12,
      }),
      INGEST_TIMEOUT_MS,
    )
    if (batch) hits.push(...batch)
  }
  if (hits.length === 0) return null
  const match =
    hits.find((row) => {
      const listingStreet = row.address.street || row.address.full || ''
      return (
        streetsMatch(street, listingStreet) ||
        streetSearchVariants(street).some((variant) =>
          streetsMatch(variant, listingStreet),
        )
      )
    }) ?? null
  if (!match) return null
  const wrote = await persistListingRecord(match)
  if (!wrote) return readListingByIdFromDb(listingRowId(match) || match.mlsId)
  return readListingByIdFromDb(listingRowId(match) || match.mlsId)
}

/**
 * One-off Find ingest: if this Vision parcel has no listings row, pull it
 * from RETS (known MLS id/key first, else one address search) and upsert
 * permanently. Never throws — a Vision-only page is better than a 502.
 */
export async function ingestFindListingIfMissing(
  vision: VisionAddressRecord,
  existing: Listing | null,
): Promise<FindListingIngestResult> {
  if (existing) return { listing: existing, ingested: false }

  try {
    const already = await findListingInDbByVisionAddress(vision)
    if (already) {
      await stampVisionListingLink(vision, already)
      return { listing: already, ingested: false }
    }

    for (const id of uniqueIds(vision.listingId, vision.mlsId)) {
      const listing = await persistByKnownId(id)
      if (listing) {
        await stampVisionListingLink(vision, listing)
        return { listing, ingested: true }
      }
    }

    const street = visionStreetLine(vision)
    if (street.length >= 4) {
      const listing = await persistByStreet(street)
      if (listing) {
        await stampVisionListingLink(vision, listing)
        return { listing, ingested: true }
      }
    }
  } catch (err) {
    console.warn('[find-listing-ingest] RETS one-off failed', err)
  }

  return { listing: null, ingested: false }
}

/** Typeahead MLS# that is not in listings yet — same one-off persist. */
export async function ingestFindListingByMlsQuery(
  raw: string,
): Promise<Listing | null> {
  const id = raw.trim()
  if (!id || /\s/.test(id) || id.length < 5) return null
  try {
    const result = await withTimeout(persistListingByMlsId(id), INGEST_TIMEOUT_MS)
    if (result?.found) {
      return (
        (await readListingByIdFromDb(id)) ??
        (await getListingByMlsId(id))
      )
    }
  } catch (err) {
    console.warn('[find-listing-ingest] MLS query ingest failed', err)
  }
  return null
}
