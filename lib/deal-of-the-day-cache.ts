import 'server-only'

import {
  clearCacheByPrefix,
  readStatsCacheRow,
  setSyncMeta,
  writeStatsCacheRow,
} from '@/lib/listings-db'
import { fetchActiveListingsForCity, hasLocalListingsCache } from '@/lib/listings-store'
import { computeDealOfTheDay, type DealPickPayload } from '@/lib/deal-pick'
import { SCORE_PEER_LIMIT } from '@/lib/goldilocks'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

/** v5: per-town sale + rental caches (page loads with ?kind=sale by default). */
export const DEAL_OF_THE_DAY_CACHE_PREFIX = 'deal-of-the-day:v5'

export type DealOfTheDayScope = TmreTown | 'All'
export type DealOfTheDayKind = 'sale' | 'rental' | 'all'

export type DealOfTheDayResponse = DealPickPayload & {
  scope: {
    towns: string[]
    city: TmreTown | null
    includesSales: boolean
    includesRentals: boolean
    belowTownMedian: boolean
    pickMode: DealPickPayload['pickMode']
    excludesNewConstruction: boolean
  }
  source?: 'db' | 'rets'
  dealCache?: boolean
}

export function dealOfTheDayCacheKey(
  scope: DealOfTheDayScope,
  kind: DealOfTheDayKind = 'all',
): string {
  return `${DEAL_OF_THE_DAY_CACHE_PREFIX}:${scope}:${kind}`
}

export function buildDealOfTheDayResponse(
  payload: DealPickPayload,
  town: TmreTown | null,
  kindFilter?: 'sale' | 'rental',
): DealOfTheDayResponse {
  return {
    ...payload,
    scope: {
      towns: town ? [town] : [...TMRE_TOWNS],
      city: town,
      includesSales: !kindFilter || kindFilter === 'sale',
      includesRentals: !kindFilter || kindFilter === 'rental',
      belowTownMedian: payload.pickMode === 'below-median',
      pickMode: payload.pickMode,
      excludesNewConstruction: payload.pickMode === 'below-median',
    },
  }
}

export function readDealOfTheDayCache(
  scope: DealOfTheDayScope,
  kind: DealOfTheDayKind = 'all',
): DealOfTheDayResponse | null {
  if (!hasLocalListingsCache()) return null
  const row = readStatsCacheRow(dealOfTheDayCacheKey(scope, kind))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as DealOfTheDayResponse
  } catch {
    return null
  }
}

export function writeDealOfTheDayCache(
  scope: DealOfTheDayScope,
  payload: DealOfTheDayResponse,
  kind: DealOfTheDayKind = 'all',
): void {
  writeStatsCacheRow(dealOfTheDayCacheKey(scope, kind), payload)
}

async function computeAndCacheScope(
  scope: DealOfTheDayScope,
  listings: Listing[],
  peerListings: Listing[],
  town: TmreTown | null,
  kind: DealOfTheDayKind,
): Promise<boolean> {
  const kindFilter = kind === 'all' ? undefined : kind
  const payload = await computeDealOfTheDay(listings, {
    peerListings,
    ...(kindFilter ? { kind: kindFilter } : {}),
  })
  if (!payload) return false
  writeDealOfTheDayCache(
    scope,
    buildDealOfTheDayResponse(payload, town, kindFilter),
    kind,
  )
  return true
}

const CACHE_KINDS: DealOfTheDayKind[] = ['sale', 'rental', 'all']

/** Recompute Deal of the Day for every town × kind (and All) from SQLite. */
export async function rebuildDealOfTheDayCache(): Promise<{
  written: number
  durationMs: number
}> {
  const startedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache_started', startedAt)
  const t0 = Date.now()
  clearCacheByPrefix(`${DEAL_OF_THE_DAY_CACHE_PREFIX}:`)
  // Drop legacy unscoped keys from v4.
  clearCacheByPrefix('deal-of-the-day:v4:')

  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: Date.now() - t0 }
  }

  let written = 0

  for (const town of TMRE_TOWNS) {
    const { listings: peerPool } = await fetchActiveListingsForCity(
      town,
      SCORE_PEER_LIMIT,
    )
    for (const kind of CACHE_KINDS) {
      if (await computeAndCacheScope(town, peerPool, peerPool, town, kind)) {
        written += 1
      }
    }
  }

  const allPeerBatches = await Promise.all(
    TMRE_TOWNS.map((town) => fetchActiveListingsForCity(town, SCORE_PEER_LIMIT)),
  )
  const seen = new Set<string>()
  const allPeerPool: Listing[] = []
  for (const batch of allPeerBatches) {
    for (const l of batch.listings) {
      const key = l.listingKey || l.mlsId
      if (!key || seen.has(key)) continue
      seen.add(key)
      allPeerPool.push(l)
    }
  }
  for (const kind of CACHE_KINDS) {
    if (await computeAndCacheScope('All', allPeerPool, allPeerPool, null, kind)) {
      written += 1
    }
  }

  const generatedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache', generatedAt)
  console.info(
    `[deal-of-the-day-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`,
  )

  return { written, durationMs: Date.now() - t0 }
}

/** Warm deal picks when SQLite has listings but no cached entries yet (e.g. dev). */
export async function rebuildDealOfTheDayCacheIfMissing(): Promise<{
  written: number
  durationMs: number
  skipped?: boolean
}> {
  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (readDealOfTheDayCache('Westport', 'sale')) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  return rebuildDealOfTheDayCache()
}
