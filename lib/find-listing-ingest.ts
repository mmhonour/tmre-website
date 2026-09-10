import 'server-only'

import { execute, query } from '@/lib/db/postgres'
import { listingRowId, readListingByIdFromDb } from '@/lib/db/listings-repo'
import { persistListingByMlsId, persistListingRecord } from '@/lib/listings-store'
import { normalizePropertyAddress } from '@/lib/property-address'
import {
  collapsedListingStreet,
  findListingHouseHasLetterSuffix,
  findListingStreetQueries,
  findListingStreetsMatch,
  findListingStreetNumberHops,
  listingHouseIlikePatterns,
} from '@/lib/find-listing-street-match'
import {
  getListingByMlsId,
  isRetsInvalidQueryError,
  searchListings,
  type Listing,
} from '@/lib/rets'
import type { VisionAddressRecord } from '@/lib/db/vision-addresses-repo'
import { compactMblu, visionListingKeys } from '@/lib/vision-listing-match'
import { listingIngestTown } from '@/lib/find-listing-ingest-shared'
import {
  closedSearchDateForVision,
  closedSearchWindowForSaleDate,
} from '@/lib/find-listing-window'

export { listingIngestTown } from '@/lib/find-listing-ingest-shared'
export { closedSearchWindowForSaleDate } from '@/lib/find-listing-window'

const INGEST_TIMEOUT_MS = 12_000

export type FindListingIngestResult = {
  listing: Listing | null
  /** True only when this request wrote a new/updated listings row from RETS. */
  ingested: boolean
}

export type FindListingIngestPhase =
  | 'checking-db'
  | 'rets-id'
  | 'rets-address'
  | 'rets-closed'
  | 'found'
  | 'none'
  | 'error'

export type FindListingIngestOnProgress = (update: {
  phase: FindListingIngestPhase
  message: string
}) => void | Promise<void>

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
  const town = listingIngestTown(vision)
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
        town,
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

const LISTING_STATUS_RANK_SQL = `CASE status_bucket
          WHEN 'Active' THEN 0
          WHEN 'Closed' THEN 1
          WHEN 'Expired' THEN 2
          ELSE 3
        END`

/**
 * Neon listings already at this Vision address (Ln↔Lane / Rd↔Road via
 * addressMatchKey, plus Sea Spray↔Seaspray), then unique MBLU /
 * ParcelNumber. Same stack as backfillVisionListingLinks.
 */
export async function findListingInDbByVisionAddress(
  vision: VisionAddressRecord,
): Promise<Listing | null> {
  const byStreet = await findListingInDbByStreet(vision)
  if (byStreet) return byStreet
  return findListingInDbByVisionMblu(vision)
}

async function findListingInDbByStreet(
  vision: VisionAddressRecord,
): Promise<Listing | null> {
  const town = listingIngestTown(vision)
  const street = visionStreetLine(vision)
  if (street.length < 4) return null
  const sourceNorm =
    vision.addressNorm ||
    normalizePropertyAddress(town, street, vision.zip ?? null)
  const want = visionListingKeys(sourceNorm)
  const house = (vision.streetNo || street.match(/^\d+[A-Za-z]?/)?.[0] || '').trim()
  if (!house) return null
  const housePatterns = listingHouseIlikePatterns(house)
  if (housePatterns.length === 0) return null

  const rows = await query<{
    id: string
    address_street: string | null
    postal_code: string | null
  }>(
    `SELECT id, address_street, postal_code
       FROM listings
      WHERE lower(town) = lower($1)
        AND address_street ILIKE ANY($2::text[])
      ORDER BY
        ${LISTING_STATUS_RANK_SQL},
        modification_timestamp DESC NULLS LAST
      LIMIT 40`,
    [town, housePatterns],
  )

  for (const row of rows) {
    const listingStreet = row.address_street?.trim()
    if (!listingStreet) continue
    const keys = visionListingKeys(
      normalizePropertyAddress(town, listingStreet, row.postal_code),
    )
    if (
      keys.exact !== want.exact &&
      keys.loose !== want.loose &&
      !findListingStreetsMatch(street, listingStreet)
    ) {
      continue
    }
    const listing = await readListingByIdFromDb(row.id)
    if (listing) return listing
  }
  return null
}

/** Compact MBLU ↔ listings.raw ParcelNumber (spaces/slashes stripped). */
export async function findListingInDbByVisionMblu(
  vision: VisionAddressRecord,
): Promise<Listing | null> {
  const town = listingIngestTown(vision)
  const mblu = compactMblu(vision.mblu)
  if (!mblu) return null
  const row = await query<{ id: string }>(
    `SELECT id
       FROM listings
      WHERE lower(town) = lower($1)
        AND NULLIF(btrim(raw->>'ParcelNumber'), '') IS NOT NULL
        AND regexp_replace(upper(btrim(raw->>'ParcelNumber')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper($2), '[^A-Z0-9]', '', 'g')
      ORDER BY
        ${LISTING_STATUS_RANK_SQL},
        modification_timestamp DESC NULLS LAST
      LIMIT 1`,
    [town, mblu],
  )
  const id = row[0]?.id
  if (!id) return null
  return readListingByIdFromDb(id)
}

function listingStreetLine(listing: Listing): string {
  const built = listing.address.street || listing.address.full || ''
  if (collapsedListingStreet(built)) return built
  const raw = listing.raw
  if (!raw) return built
  return [raw.StreetNumber, raw.StreetName, raw.StreetType]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(' ')
}

function listingMatchesStreetQuery(street: string, listingStreet: string): boolean {
  return findListingStreetsMatch(street, listingStreet)
}

function listingMatchesIngestTown(town: string, listing: Listing): boolean {
  const city = (listing.address.city || '').trim().toLowerCase()
  const want = town.trim().toLowerCase()
  return !want || !city || city === want
}

function listingStatusRank(status: string | null | undefined): number {
  const key = (status ?? '').trim().toLowerCase()
  if (key === 'active' || key === 'coming soon') return 0
  if (key.includes('under contract')) return 1
  if (key === 'closed' || key === 'sold') return 2
  if (key === 'expired') return 3
  return 4
}

function listingIsWeakOffMarket(status: string | null | undefined): boolean {
  const key = (status ?? '').trim().toLowerCase()
  return key.includes('cancel') || key.includes('withdrawn')
}

async function searchStreetNumberHop(
  street: string,
  town: string,
  streetNumber: string,
  closed?: { closedAfter: string; closedBefore: string },
): Promise<Listing | null> {
  try {
    const hits = await withTimeout(
      searchListings({
        county: 'fairfield',
        city: town,
        streetNumber,
        limit: 24,
        ...(closed
          ? {
              status: 'Closed' as const,
              closedAfter: closed.closedAfter,
              closedBefore: closed.closedBefore,
            }
          : {}),
      }),
      INGEST_TIMEOUT_MS,
    )
    if (!hits || hits.length === 0) return null
    return pickBestStreetMatch(street, hits, town)
  } catch (err) {
    if (isRetsInvalidQueryError(err)) return null
    throw err
  }
}

async function persistStructuredStreet(
  street: string,
  town: string,
  closed?: { closedAfter: string; closedBefore: string },
): Promise<Listing | null> {
  for (const streetNumber of findListingStreetNumberHops(street)) {
    const match = await searchStreetNumberHop(street, town, streetNumber, closed)
    if (match && (closed || !listingIsWeakOffMarket(match.status))) {
      return persistMatchedListing(match)
    }
  }
  return null
}

function pickBestStreetMatch(
  street: string,
  hits: Listing[],
  town?: string,
): Listing | null {
  const matched = hits.filter((row) => {
    if (town && !listingMatchesIngestTown(town, row)) return false
    return listingMatchesStreetQuery(street, listingStreetLine(row))
  })
  if (matched.length === 0) return null
  return [...matched].sort((a, b) => {
    const rank = listingStatusRank(a.status) - listingStatusRank(b.status)
    if (rank !== 0) return rank
    const aAt = a.statusChangeTimestamp || a.modificationTimestamp || ''
    const bAt = b.statusChangeTimestamp || b.modificationTimestamp || ''
    return bAt.localeCompare(aAt)
  })[0] ?? null
}

async function persistMatchedListing(match: Listing): Promise<Listing | null> {
  const wrote = await persistListingRecord(match)
  if (!wrote) return readListingByIdFromDb(listingRowId(match) || match.mlsId)
  return readListingByIdFromDb(listingRowId(match) || match.mlsId)
}

async function persistByStreet(
  street: string,
  town: string,
): Promise<Listing | null> {
  const structured = await persistStructuredStreet(street, town)
  if (structured && !listingIsWeakOffMarket(structured.status)) {
    return structured
  }
  if (findListingHouseHasLetterSuffix(street)) {
    return structured
  }
  for (const queryStreet of findListingStreetQueries(street)) {
    const hits = await withTimeout(
      searchListings({
        county: 'fairfield',
        city: town,
        addressContains: queryStreet,
        limit: 24,
      }),
      INGEST_TIMEOUT_MS,
    )
    if (!hits || hits.length === 0) continue
    const match = pickBestStreetMatch(street, hits, town)
    if (match && !listingIsWeakOffMarket(match.status)) {
      return persistMatchedListing(match)
    }
  }
  return structured
}

/**
 * Address + Closed StatusChangeTimestamp window. Unscoped address search
 * misses pre-2019 sales (they were never bulk-synced and SmartMLS will not
 * return them without the date range). UnparsedAddress is often empty on
 * those rows — StreetNumber + StreetName is the hop that hits 2A-A.
 */
async function persistByStreetClosed(
  street: string,
  lastSaleDate: string | null | undefined,
  town: string,
): Promise<Listing | null> {
  const window = closedSearchWindowForSaleDate(lastSaleDate)
  const structured = await persistStructuredStreet(street, town, window)
  if (structured) return structured
  if (findListingHouseHasLetterSuffix(street)) {
    return null
  }
  for (const queryStreet of findListingStreetQueries(street)) {
    const hits = await withTimeout(
      searchListings({
        county: 'fairfield',
        city: town,
        addressContains: queryStreet,
        status: 'Closed',
        closedAfter: window.closedAfter,
        closedBefore: window.closedBefore,
        limit: 24,
      }),
      INGEST_TIMEOUT_MS,
    )
    if (!hits || hits.length === 0) continue
    const match = pickBestStreetMatch(street, hits, town)
    if (match) return persistMatchedListing(match)
  }
  return null
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
  town = 'Westport',
): Promise<Listing | null> {
  const street = raw.trim()
  if (!looksLikeStreetQuery(street)) return null
  const city = listingIngestTown(town)
  try {
    return (
      (await persistByStreet(street, city)) ??
      (await persistByStreetClosed(street, null, city))
    )
  } catch (err) {
    console.warn('[find-listing-ingest] street query ingest failed', err)
    return null
  }
}

/**
 * One-off Find ingest: if this Vision parcel has no listings row, pull it
 * from RETS (known MLS id/key first, else Closed year-window around the
 * paid Vision deed, else live address search) and upsert permanently. Never
 * throws — a Vision-only page is better than a 502.
 */
export async function ingestFindListingIfMissing(
  vision: VisionAddressRecord,
  existing: Listing | null,
  onProgress?: FindListingIngestOnProgress,
): Promise<FindListingIngestResult> {
  if (existing) return { listing: existing, ingested: false }

  const report = async (
    phase: FindListingIngestPhase,
    message: string,
  ): Promise<void> => {
    try {
      await onProgress?.({ phase, message })
    } catch {
      /* progress is best-effort */
    }
  }

  try {
    await report('checking-db', 'Checking listings…')
    const already = await findListingInDbByVisionAddress(vision)
    if (already) {
      await stampVisionListingLink(vision, already)
      await report('found', 'Already in listings')
      return { listing: already, ingested: false }
    }

    for (const id of uniqueIds(vision.listingId, vision.mlsId)) {
      await report('rets-id', `Pulling ${id} from RETS…`)
      const listing = await persistByKnownId(id)
      if (listing) {
        await stampVisionListingLink(vision, listing)
        await report('found', listing.status || 'Found in RETS')
        return { listing, ingested: true }
      }
    }

    const street = visionStreetLine(vision)
    const town = listingIngestTown(vision)
    if (street.length >= 4) {
      const closedDate = closedSearchDateForVision(vision)
      const window = closedSearchWindowForSaleDate(closedDate)
      if (closedDate) {
        await report(
          'rets-closed',
          `Closed window ${window.closedAfter.slice(0, 4)}–${window.closedBefore.slice(0, 4)}…`,
        )
        const byClosed = await persistByStreetClosed(street, closedDate, town)
        if (byClosed) {
          await stampVisionListingLink(vision, byClosed)
          await report('found', byClosed.status || 'Found in RETS')
          return { listing: byClosed, ingested: true }
        }
      }

      await report('rets-address', `Searching RETS for ${street}…`)
      const byAddress = await persistByStreet(street, town)
      if (byAddress && !listingIsWeakOffMarket(byAddress.status)) {
        await stampVisionListingLink(vision, byAddress)
        await report('found', byAddress.status || 'Found in RETS')
        return { listing: byAddress, ingested: true }
      }

      if (!closedDate) {
        await report(
          'rets-closed',
          `Closed window ${window.closedAfter.slice(0, 4)}–${window.closedBefore.slice(0, 4)}…`,
        )
        const byClosed = await persistByStreetClosed(street, closedDate, town)
        if (byClosed) {
          await stampVisionListingLink(vision, byClosed)
          await report('found', byClosed.status || 'Found in RETS')
          return { listing: byClosed, ingested: true }
        }
      }
      if (byAddress) {
        await stampVisionListingLink(vision, byAddress)
        await report('found', byAddress.status || 'Found in RETS')
        return { listing: byAddress, ingested: true }
      }
    }
  } catch (err) {
    console.warn('[find-listing-ingest] RETS one-off failed', err)
    await report('error', 'RETS search failed')
    return { listing: null, ingested: false }
  }

  await report('none', 'No MLS listing in RETS')
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
