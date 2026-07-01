import 'server-only'

import {
  getSyncMeta,
  readAllListingsFromDb,
  readListingByIdFromDb,
  readListingsFromDb,
  setSyncMeta,
} from '@/lib/listings-db'
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

export type ListingsSource = 'db' | 'rets'

/** MLS status used for all non-Stats inventory (deal board, search, etc.). */
export const ACTIVE_MLS_STATUS = 'Active'
export const COMING_SOON_MLS_STATUS = 'Coming Soon'

/** Closed sales pulled from RETS for stats/charts since this date. */
export const CLOSED_LISTINGS_SINCE = '2024-01-01'

/** True for on-market MLS rows: Active and Coming Soon (excludes pending, closed, withdrawn). */
export function isMarketListing(l: Listing): boolean {
  const s = l.status?.trim().toLowerCase()
  return s === 'active' || s === 'a' || s === 'coming soon' || s === 'cs'
}

/** True for closed MLS rows (SmartMLS status C). */
export function isClosedListing(l: Listing): boolean {
  const s = l.status?.trim().toLowerCase()
  return s === 'closed' || s === 'c'
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

/** True if the DB has been populated at least once. */
export function hasLocalListingsCache(): boolean {
  return getLastFullSync() != null
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

function readDbListings(
  city: string,
  bucket: string,
  limit?: number,
): Listing[] | null {
  if (!hasLocalListingsCache()) return null
  return readListingsFromDb(city, bucket, limit)
}

function readDbListingsAcrossTowns(
  towns: readonly string[],
  bucket: string,
  limit?: number,
): Listing[] | null {
  if (!hasLocalListingsCache()) return null
  const rows = readAllListingsFromDb(towns, bucket)
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
): Promise<Listing[]> {
  const byCity = await searchListings({ city: town, status, limit })
  let listings = applyActiveBucketFilters(byCity, town)
  if (listings.length > 0) return listings.slice(0, limit)

  const perZip = Math.max(50, Math.ceil(limit / zipsForTown(town).length))
  const batches = await Promise.all(
    zipsForTown(town).map((zip) =>
      searchListings({ zip, status, limit: perZip }).catch(() => [] as Listing[]),
    ),
  )
  listings = applyActiveBucketFilters(batches.flat(), town)
  return listings.slice(0, limit)
}

function dbActiveListingsUsable(
  cached: Listing[],
  filtered: Listing[],
  city: string,
): boolean {
  if (filtered.length > 0) {
    const expected = getSyncedActiveCount(city)
    // Partial cache (e.g. interrupted sync or accidental row loss) — prefer live RETS.
    if (expected != null && filtered.length < expected * 0.85) return false
    return true
  }
  if (cached.length === 0) return false
  // Rows exist but none belong to this town — stale sync data.
  return !isTmreTown(city)
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
  const cached = readDbListings(city, bucket, limit)
  if (cached != null && cached.length > 0) {
    const listings =
      bucket === 'Active' ? applyActiveBucketFilters(cached, city) : cached
    if (
      bucket !== 'Active' ||
      dbActiveListingsUsable(cached, listings, city)
    ) {
      return { listings, source: 'db' }
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
  const cached = readDbListingsAcrossTowns(towns, bucket, limit)
  if (cached != null) {
    if (cached.length > 0 || bucket !== 'Active') {
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
  return fetchActiveListingsAcrossTowns(TMRE_TOWNS, { limit: 500 })
}

export async function fetchListingByMlsId(
  id: string,
): Promise<{ listing: Listing | null; source: ListingsSource }> {
  if (hasLocalListingsCache()) {
    const cached = readListingByIdFromDb(id)
    if (cached) return { listing: refreshListingSchools(cached), source: 'db' }
  }

  const listing = await getListingByMlsId(id)
  return { listing, source: 'rets' as const }
}
