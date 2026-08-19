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

/** MLS UnparsedAddress uses Lane/Road — pick the longest spelling for one RETS hop. */
function preferredRetsStreet(street: string): string {
  const variants = streetSearchVariants(street)
  return variants.reduce(
    (best, next) => (next.length > best.length ? next : best),
    variants[0] ?? street,
  )
}

function listingMatchesStreetQuery(street: string, listingStreet: string): boolean {
  if (streetsMatch(street, listingStreet)) return true
  return streetSearchVariants(street).some((variant) =>
    streetsMatch(variant, listingStreet),
  )
}

async function persistByStreet(street: string): Promise<Listing | null> {
  const queryStreet = preferredRetsStreet(street)
  const hits = await withTimeout(
    searchListings({
      county: 'fairfield',
      city: WESTPORT,
      addressContains: queryStreet,
      limit: 24,
    }),
    INGEST_TIMEOUT_MS,
  )
  if (!hits || hits.length === 0) return null
  const match =
    hits.find((row) =>
      listingMatchesStreetQuery(
        street,
        row.address.street || row.address.full || '',
      ),
    ) ?? null
  if (!match) return null
  const wrote = await persistListingRecord(match)
  if (!wrote) return readListingByIdFromDb(listingRowId(match) || match.mlsId)
  return readListingByIdFromDb(listingRowId(match) || match.mlsId)
}

export function looksLikeStreetQuery(raw: string): boolean {
  return /^\d+[A-Za-z]?\s+[A-Za-z]/.test(raw.trim())
}

/**
 * Typeahead / Find: one RETS address search (Lane/Road form) when Neon
 * and Vision have no listing yet. Persists the row so the next lookup is local.
 */
export async function ingestFindListingByStreetQuery(
  raw: string,
): Promise<Listing | null> {
  const street = raw.trim()
  if (!looksLikeStreetQuery(street)) return null
  try {
    return await persistByStreet(street)
  } catch (err) {
    console.warn('[find-listing-ingest] street query ingest failed', err)
    return null
  }
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
