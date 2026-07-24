import 'server-only'

import {
  refreshListingPropertyTax,
} from '@/lib/listing-property-tax'
import { refreshListingIfEstimate } from '@/lib/listing-if-compute'
import {
  upsertListing,
  upsertTownListings,
} from '@/lib/db/listings-repo'
import {
  hasListingsData,
  readAllListingsFromDb,
  readListingByIdFromDb,
  readListingsFromDb,
} from '@/lib/db/listings-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import {
  getListingByMlsId,
  refreshListingSchools,
  searchListings,
  searchListingsAcrossTowns,
  type Listing,
  type SearchParams,
} from '@/lib/rets'
import {
  TMRE_TOWNS,
  filterListingsForTown,
  isTmreTown,
  resolveListingTown,
  townForZip,
  zipsForTown,
  type TmreTown,
} from '@/lib/tmre-towns'
import {
  isUnderContractStatus,
} from '@/lib/listing-status'

export {
  isUnderContractStatus,
  underContractStatusLabel,
} from '@/lib/listing-status'

export type ListingsSource = 'db' | 'rets'

/** MLS status used for all non-Stats inventory (deal board, search, etc.). */
export const ACTIVE_MLS_STATUS = 'Active'
export const COMING_SOON_MLS_STATUS = 'Coming Soon'
/** SmartMLS under-agreement statuses (stored in the Active status_bucket). */
export const UNDER_CONTRACT_MLS_STATUS = 'Under Contract'
export const UNDER_CONTRACT_CTS_MLS_STATUS =
  'Under Contract - Continue to Show'

/** Closed sales pulled from RETS for stats/charts since this date. */
export const CLOSED_LISTINGS_SINCE = '2019-01-01'

/** Max listings pulled per town during sync and broad fetches. */
export const ACTIVE_LISTINGS_FETCH_LIMIT = 2000
export const CLOSED_LISTINGS_FETCH_LIMIT = 5000
export const EXPIRED_LISTINGS_FETCH_LIMIT = 500

/** True for Active-bucket MLS rows: Active, Coming Soon, and Under Contract / CTS. */
export function isMarketListing(l: Listing): boolean {
  const s = l.status?.trim().toLowerCase()
  if (!s) return false
  if (isUnderContractStatus(l.status)) return true
  return s === 'active' || s === 'a' || s === 'coming soon' || s === 'cs'
}

/** True for closed MLS rows (SmartMLS status C). */
export function isClosedListing(l: Listing): boolean {
  const s = l.status?.trim().toLowerCase()
  return s === 'closed' || s === 'c'
}

export function isUnderContractListing(l: Listing): boolean {
  return isUnderContractStatus(l.status)
}

/** @deprecated Use isMarketListing */
export const isActiveListing = isMarketListing

export function filterMarketListings(listings: Listing[]): Listing[] {
  return listings.filter(isMarketListing)
}

/** @deprecated Use filterMarketListings */
export const filterActiveListings = filterMarketListings

function normalizeStatusBucket(status: string): string {
  const key = status.trim().toLowerCase()
  if (key === 'closed' || key === 'c') return 'Closed'
  if (key === 'expired' || key === 'x') return 'Expired'
  return 'Active'
}

/** When was the last successful full sync? */
export function getLastFullSync(): string | null {
  return getSyncMeta('last_full_sync')
}

/** Active inventory count recorded at last successful town sync (Active + Coming Soon). */
export function getSyncedActiveCount(city: string): number | null {
  const raw = getSyncMeta(`active_count:${city}`)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function setSyncedActiveCount(city: string, count: number): void {
  setSyncMeta(`active_count:${city}`, String(count))
}

/** True if Postgres holds synced listing inventory (not just sync metadata). */
export async function hasLocalListingsCache(): Promise<boolean> {
  return hasListingsData()
}

/** HTTP headers for fast edge/browser caching when serving from SQLite. */
export function listingCacheHeaders(source: ListingsSource): HeadersInit {
  if (source === 'db') {
    return {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
      'X-Listings-Source': 'db',
    }
  }
  return {
    'Cache-Control': 'private, no-store',
    'X-Listings-Source': 'rets',
  }
}

/**
 * Cache headers for Spotlight APIs that key off query params (`property`,
 * `photos`, `kind`).
 *
 * Netlify's CDN ignores query strings in the cache key unless `Netlify-Vary`
 * says otherwise — so `public, s-maxage=…` on `/api/spotlight?property=2`
 * would reuse the response cached for `property=1` and make every tab look
 * like the same listing. Never CDN-cache these routes.
 */
export function spotlightApiCacheHeaders(): HeadersInit {
  return {
    'Cache-Control': 'private, no-store',
    'Netlify-Vary': 'query=property|photos|kind',
    'X-Listings-Source': 'db',
  }
}

async function readDbListings(
  city: string,
  bucket: string,
  limit?: number,
): Promise<Listing[] | null> {
  if (!(await hasListingsData())) return null
  const all = await readListingsFromDb(city, bucket)
  return limit != null ? all.slice(0, limit) : all
}

async function readDbListingsAcrossTowns(
  towns: readonly string[],
  bucket: string,
  limit?: number,
): Promise<Listing[] | null> {
  if (!(await hasListingsData())) return null
  const rows = await readAllListingsFromDb(towns, bucket)
  return limit != null ? rows.slice(0, limit) : rows
}

function applyActiveBucketFilters(listings: Listing[], city: string): Listing[] {
  let out = filterMarketListings(listings)
  if (isTmreTown(city)) {
    out = filterListingsForTown(out, city as TmreTown)
  }
  return out
}

function filterListingsToTowns(
  listings: Listing[],
  towns: readonly string[],
): Listing[] {
  const allowed = new Set(towns.map((t) => t.toLowerCase()))
  return filterMarketListings(listings).filter((l) => {
    const town = townForZip(l.address.postalCode) ?? resolveListingTown(l.address.city)
    return town != null && allowed.has(town.toLowerCase())
  })
}

export async function searchMarketListingsForTown(
  town: TmreTown,
  status: string,
  limit: number,
  options: { modifiedAfter?: string } = {},
): Promise<Listing[]> {
  const searchOpts = { city: town, status, limit, modifiedAfter: options.modifiedAfter }
  const byCity = await searchListings(searchOpts)
  let listings = applyActiveBucketFilters(byCity, town)

  // Incremental sync: city-only is enough when the MLS returns matches; empty city
  // + modifiedAfter means nothing changed for that town filter.
  if (options.modifiedAfter) {
    return listings.slice(0, limit)
  }

  // Full pulls: always union city + zip searches. City DMQL alone often undercounts
  // multi-zip towns (city name / area mismatches), and returning early on any
  // non-empty city hit permanently underfills SQLite after upsertTownListings.
  const zips = zipsForTown(town)
  const perZip = Math.max(50, Math.ceil(limit / Math.max(zips.length, 1)))
  const batches = await Promise.all(
    zips.map((zip) =>
      searchListings({ zip, status, limit: perZip }).catch(() => [] as Listing[]),
    ),
  )
  listings = mergeListings(listings, applyActiveBucketFilters(batches.flat(), town))
  return listings.slice(0, limit)
}

function dbActiveListingsUsable(
  cached: Listing[],
  filtered: Listing[],
  city: string,
): boolean {
  if (filtered.length > 0) {
    const expected = getSyncedActiveCount(city)
    // Compare raw bucket size — town zip filters can shrink filtered count without stale cache.
    if (expected != null && cached.length < expected * 0.85) return false
    return true
  }
  if (cached.length === 0) return false
  // Rows exist but none belong to this town — stale sync data.
  return !isTmreTown(city)
}

async function persistListingsBatch(listings: Listing[]): Promise<void> {
  if (listings.length === 0) return
  for (const listing of listings) {
    await persistListingRecord(listing)
  }
}

function mergeListings(a: Listing[], b: Listing[]): Listing[] {
  const seen = new Set<string>()
  const merged: Listing[] = []
  for (const l of [...a, ...b]) {
    const key = l.listingKey || l.mlsId
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(l)
  }
  return merged
}

/** DB-first read — only hits RETS when the local cache has no rows for this query. */
export async function fetchListingsForCity(
  city: string,
  status: string,
  limit: number,
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  const bucket = normalizeStatusBucket(status)
  const cached = await readDbListings(city, bucket, limit)
  if (cached != null && (cached.length > 0 || getLastFullSync() != null)) {
    const listings =
      bucket === 'Active' ? applyActiveBucketFilters(cached, city) : cached
    if (
      bucket !== 'Active' ||
      cached.length === 0 ||
      dbActiveListingsUsable(cached, listings, city)
    ) {
      return {
        listings: limit != null ? listings.slice(0, limit) : listings,
        source: 'db',
      }
    }
    // Stale/wrong-town active cache — fall through to RETS.
  }

  let listings: Listing[]
  if (bucket === 'Active' && isTmreTown(city)) {
    listings = await searchMarketListingsForTown(city as TmreTown, status, limit)
  } else {
    listings = await searchListings({
      city,
      status,
      limit,
      ...(bucket === 'Closed' ? { closedAfter: CLOSED_LISTINGS_SINCE } : {}),
    })
    if (bucket === 'Active') {
      listings = applyActiveBucketFilters(listings, city)
    }
  }
  await persistListingsBatch(listings)
  return { listings, source: 'rets' }
}

/** Active + Coming Soon inventory — use for deal board, search, and all non-Stats pages. */
export async function fetchActiveListingsForCity(
  city: string,
  limit: number,
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  const [activeResult, comingSoonResult] = await Promise.all([
    fetchListingsForCity(city, ACTIVE_MLS_STATUS, limit),
    fetchListingsForCity(city, COMING_SOON_MLS_STATUS, limit).catch(() => ({
      listings: [] as Listing[],
      source: 'rets' as const,
    })),
  ])
  const source =
    activeResult.source === 'db' && comingSoonResult.source === 'db' ? 'db' : 'rets'
  return {
    listings: mergeListings(activeResult.listings, comingSoonResult.listings).slice(0, limit),
    source,
  }
}

/** Closed sales — Stats page and analytics endpoints only. */
export async function fetchClosedListingsForCity(
  city: string,
  limit: number,
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  return fetchListingsForCity(city, 'Closed', limit)
}

export const EXPIRED_MLS_STATUS = 'Expired'

/** Minimum days since expiry before a listing appears on the Expired Listings page. */
export const EXPIRED_MIN_AGE_DAYS = 30

/** True for expired MLS rows (SmartMLS status X). */
export function isExpiredListing(l: Listing): boolean {
  const s = l.status?.trim().toLowerCase()
  return s === 'expired' || s === 'x'
}

/** Days since status change (expiry), or null when unknown. */
export function expiredListingAgeDays(l: Listing): number | null {
  const ts = l.statusChangeTimestamp ?? l.modificationTimestamp
  if (!ts) return null
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

export function isExpiredListingOlderThan(l: Listing, minDays: number): boolean {
  const age = expiredListingAgeDays(l)
  return age != null && age >= minDays
}

type ExpiredSearchOptions = {
  /** When set, restrict StatusChangeTimestamp to listings expired at least this many days ago. */
  minAgeDays?: number
}

function expiredSearchParams(limit: number, options: ExpiredSearchOptions = {}) {
  const params: SearchParams = {
    status: EXPIRED_MLS_STATUS,
    limit,
  }
  const minAge = options.minAgeDays ?? 0
  if (minAge > 0) {
    params.closedAfter = '2000-01-01'
    const d = new Date()
    d.setDate(d.getDate() - minAge)
    params.closedBefore = d.toISOString().slice(0, 10)
  }
  return params
}

function applyExpiredTownFilter(listings: Listing[], city: string): Listing[] {
  let out = listings.filter(isExpiredListing)
  if (isTmreTown(city)) {
    out = filterListingsForTown(out, city as TmreTown)
  }
  return out
}

/** Expired inventory for one town — fetched from RETS (sync pulls all; page filters age in API). */
export async function searchExpiredListingsForTown(
  town: TmreTown,
  limit: number,
  options: ExpiredSearchOptions = {},
): Promise<Listing[]> {
  const params = expiredSearchParams(limit, options)
  const byCity = await searchListings({ city: town, ...params })
  let listings = applyExpiredTownFilter(byCity, town)
  if (listings.length > 0) return listings.slice(0, limit)

  const perZip = Math.max(50, Math.ceil(limit / zipsForTown(town).length))
  const batches = await Promise.all(
    zipsForTown(town).map((zip) =>
      searchListings({ zip, ...params, limit: perZip }).catch(() => [] as Listing[]),
    ),
  )
  listings = applyExpiredTownFilter(batches.flat(), town)
  return listings.slice(0, limit)
}

/** Expired listings — SQLite first, RETS fallback with upsert into Expired bucket. */
export async function fetchExpiredListingsForCity(
  city: string,
  limit: number,
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  const bucket = 'Expired'
  const cached = await readDbListings(city, bucket, limit)
  if (cached != null && (cached.length > 0 || getLastFullSync() != null)) {
    return {
      listings: applyExpiredTownFilter(cached, city).slice(0, limit),
      source: 'db',
    }
  }

  let listings: Listing[]
  if (isTmreTown(city)) {
    listings = await searchExpiredListingsForTown(city as TmreTown, limit)
  } else {
    listings = applyExpiredTownFilter(
      await searchListings({ city, ...expiredSearchParams(limit) }),
      city,
    )
  }

  if (isTmreTown(city) && listings.length > 0) {
    await upsertTownListings(city, bucket, listings)
  }

  return { listings, source: 'rets' }
}

export async function fetchClosedListingsAcrossTowns(
  towns: readonly string[],
  params: Omit<SearchParams, 'city' | 'county' | 'status'> = {},
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  return fetchListingsAcrossTowns(towns, { ...params, status: 'Closed' })
}

export async function fetchListingsAcrossTowns(
  towns: readonly string[],
  params: Omit<SearchParams, 'city' | 'county'> = {},
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  const bucket = normalizeStatusBucket(params.status ?? ACTIVE_MLS_STATUS)
  const limit = params.limit
  const cached = await readDbListingsAcrossTowns(towns, bucket, limit)
  if (cached != null) {
    if (cached.length > 0 || bucket !== 'Active' || getLastFullSync() != null) {
      let listings =
        bucket === 'Active' ? filterListingsToTowns(cached, towns) : cached
      if (bucket === 'Active' && towns.length === 1 && isTmreTown(towns[0])) {
        listings = filterListingsForTown(listings, towns[0] as TmreTown)
      }
      if (
        bucket !== 'Active' ||
        listings.length > 0 ||
        cached.length === 0
      ) {
        return { listings, source: 'db' }
      }
    }
  }

  let listings: Listing[]
  if (bucket === 'Active') {
    const batches = await Promise.all(
      towns.map((town) =>
        isTmreTown(town)
          ? searchMarketListingsForTown(town as TmreTown, params.status ?? ACTIVE_MLS_STATUS, limit ?? 500)
          : searchListings({ city: town, status: params.status ?? ACTIVE_MLS_STATUS, limit: limit ?? 500 }).catch(
              () => [] as Listing[],
            ),
      ),
    )
    listings = batches.reduce(
      (acc, batch) => mergeListings(acc, batch),
      [] as Listing[],
    )
    if (limit != null) listings = listings.slice(0, limit)
  } else {
    listings = await searchListingsAcrossTowns(towns, {
      ...params,
      status: params.status ?? ACTIVE_MLS_STATUS,
    })
  }
  await persistListingsBatch(listings)
  return { listings, source: 'rets' }
}

/** Active + Coming Soon inventory across towns — non-Stats pages only. */
export async function fetchActiveListingsAcrossTowns(
  towns: readonly string[],
  params: Omit<SearchParams, 'city' | 'county' | 'status'> = {},
): Promise<{ listings: Listing[]; source: ListingsSource }> {
  const limit = params.limit ?? 500
  const batches = await Promise.all(
    towns.map((town) => fetchActiveListingsForCity(town, limit)),
  )
  const source = batches.some((b) => b.source === 'rets') ? 'rets' : 'db'
  return {
    listings: batches
      .reduce((acc, batch) => mergeListings(acc, batch.listings), [] as Listing[])
      .slice(0, limit * towns.length),
    source,
  }
}

export async function fetchAllActiveListings(): Promise<{
  listings: Listing[]
  source: ListingsSource
}> {
  return fetchActiveListingsAcrossTowns(TMRE_TOWNS, {
    limit: ACTIVE_LISTINGS_FETCH_LIMIT,
  })
}

export async function fetchListingByMlsId(
  id: string,
): Promise<{ listing: Listing | null; source: ListingsSource }> {
  const cached = await readListingByIdFromDb(id)
  if (cached) {
    return {
      listing: refreshListingPropertyTax(refreshListingSchools(cached)),
      source: 'db',
    }
  }

  const listing = await getListingByMlsId(id)
  if (listing) {
    void persistListingRecord(listing).catch((err) => {
      console.warn('[listings-store] RETS fetch persist skipped:', err)
    })
  }
  return { listing, source: 'rets' as const }
}

/** Postgres-only — used by listing detail tabs; never calls RETS. */
export async function readListingFromDbByMlsId(
  id: string,
): Promise<{ listing: Listing | null; source: 'db' }> {
  const trimmed = id.trim()
  if (!trimmed) {
    return { listing: null, source: 'db' }
  }
  const cached = await readListingByIdFromDb(trimmed)
  if (!cached) return { listing: null, source: 'db' }
  return {
    listing: refreshListingPropertyTax(refreshListingSchools(cached)),
    source: 'db',
  }
}

function townForListingRecord(listing: Listing): string {
  return (
    resolveListingTown(listing.address.city) ||
    townForZip(listing.address.postalCode ?? '') ||
    listing.address.city?.trim() ||
    'Unknown'
  )
}

/** Upsert an already-loaded listing into Postgres. */
export async function persistListingRecord(listing: Listing): Promise<boolean> {
  const town = townForListingRecord(listing)
  const statusBucket = normalizeStatusBucket(listing.status ?? ACTIVE_MLS_STATUS)
  try {
    const { upserted } = await upsertListing(listing, town, statusBucket)
    if (upserted && isMarketListing(listing)) {
      void refreshListingIfEstimate(listing).catch((err) => {
        console.warn('[listings-store] If estimate refresh skipped:', err)
      })
    }
    return upserted
  } catch (err) {
    console.warn('[listings-store] persist skipped:', err)
    return false
  }
}

/** Fetch live from MLS and upsert into SQLite when available. */
export async function persistListingByMlsId(
  id: string,
): Promise<{ cached: boolean; found: boolean; source: ListingsSource }> {
  const trimmed = id.trim()
  if (!trimmed) return { cached: false, found: false, source: 'rets' }

  const listing = await getListingByMlsId(trimmed)
  if (!listing) return { cached: false, found: false, source: 'rets' }

  const cached = await persistListingRecord(listing)
  return { cached, found: true, source: 'rets' }
}
