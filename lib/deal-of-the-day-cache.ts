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

export const DEAL_OF_THE_DAY_CACHE_PREFIX = 'deal-of-the-day:v4'

export type DealOfTheDayScope = TmreTown | 'All'

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

export function dealOfTheDayCacheKey(scope: DealOfTheDayScope): string {
  return `${DEAL_OF_THE_DAY_CACHE_PREFIX}:${scope}`
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

export function readDealOfTheDayCache(scope: DealOfTheDayScope): DealOfTheDayResponse | null {
  if (!hasLocalListingsCache()) return null
  const row = readStatsCacheRow(dealOfTheDayCacheKey(scope))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as DealOfTheDayResponse
  } catch {
    return null
  }
}

export function writeDealOfTheDayCache(scope: DealOfTheDayScope, payload: DealOfTheDayResponse): void {
  writeStatsCacheRow(dealOfTheDayCacheKey(scope), payload)
}

async function computeAndCacheScope(
  scope: DealOfTheDayScope,
  listings: Listing[],
  peerListings: Listing[],
  town: TmreTown | null,
): Promise<boolean> {
  const payload = await computeDealOfTheDay(listings, { peerListings })
  if (!payload) return false
  writeDealOfTheDayCache(scope, buildDealOfTheDayResponse(payload, town))
  return true
}

/** Recompute Deal of the Day for every town (and All) from SQLite active listings. */
export async function rebuildDealOfTheDayCache(): Promise<{
  written: number
  durationMs: number
}> {
  const t0 = Date.now()
  clearCacheByPrefix(`${DEAL_OF_THE_DAY_CACHE_PREFIX}:`)

  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: Date.now() - t0 }
  }

  let written = 0

  for (const town of TMRE_TOWNS) {
    const { listings: peerPool } = await fetchActiveListingsForCity(town, SCORE_PEER_LIMIT)
    if (await computeAndCacheScope(town, peerPool, peerPool, town)) written += 1
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
  if (await computeAndCacheScope('All', allPeerPool, allPeerPool, null)) written += 1

  const generatedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache', generatedAt)
  console.info(`[deal-of-the-day-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`)

  return { written, durationMs: Date.now() - t0 }
}
