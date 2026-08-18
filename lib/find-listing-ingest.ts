import 'server-only'

import { execute } from '@/lib/db/postgres'
import { listingRowId, readListingByIdFromDb } from '@/lib/db/listings-repo'
import { streetsMatch } from '@/lib/listing-history'
import { persistListingByMlsId, persistListingRecord } from '@/lib/listings-store'
import { getListingByMlsId, searchListings, type Listing } from '@/lib/rets'
import type { VisionAddressRecord } from '@/lib/db/vision-addresses-repo'

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

async function linkVisionToListing(
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

async function persistByStreet(street: string): Promise<Listing | null> {
  const hits = await withTimeout(
    searchListings({
      county: 'fairfield',
      city: WESTPORT,
      addressContains: street,
      limit: 12,
    }),
    INGEST_TIMEOUT_MS,
  )
  if (!hits || hits.length === 0) return null
  const match =
    hits.find((row) =>
      streetsMatch(street, row.address.street || row.address.full || ''),
    ) ?? null
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
    for (const id of uniqueIds(vision.listingId, vision.mlsId)) {
      const listing = await persistByKnownId(id)
      if (listing) {
        await linkVisionToListing(vision, listing)
        return { listing, ingested: true }
      }
    }

    const street = [vision.streetNo, vision.streetName].filter(Boolean).join(' ').trim()
      || vision.addressFull?.split(',')[0]?.trim()
      || ''
    if (street.length >= 4) {
      const listing = await persistByStreet(street)
      if (listing) {
        await linkVisionToListing(vision, listing)
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
