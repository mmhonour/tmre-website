import 'server-only'

import { setSyncMeta } from '@/lib/db/sync-meta-store'
import {
  clearCacheByPrefix,
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { fetchActiveListingsForCity, hasLocalListingsCache, isMarketListing } from '@/lib/listings-store'
import {
  dealListingPhotoUrl,
  pickDealOfTheDayFromBoardScored,
  scoreActiveListingsForBoard,
  type DealPickPayload,
} from '@/lib/deal-pick'
import { ensureDealPickPhotos, dealPickPhotosReady } from '@/lib/deal-hero-photo-warm'
import { kindOf, SCORE_PEER_LIMIT } from '@/lib/goldilocks'
import type { Listing } from '@/lib/rets'
import { filterListingsToTmreTowns, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

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

export type DealOfTheDayBundleResponse = {
  generatedAt: string
  kind: DealOfTheDayKind
  deals: Partial<Record<TmreTown, DealOfTheDayResponse>>
  source: 'db'
  dealCache: true
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

export async function readDealOfTheDayCache(
  scope: DealOfTheDayScope,
  kind: DealOfTheDayKind = 'all',
): Promise<DealOfTheDayResponse | null> {
  if (!hasLocalListingsCache()) return null
  const row = await readStatsCacheRow(dealOfTheDayCacheKey(scope, kind))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as DealOfTheDayResponse
  } catch {
    return null
  }
}

export async function readDealOfTheDayBundle(
  kind: DealOfTheDayKind = 'all',
): Promise<DealOfTheDayBundleResponse | null> {
  if (!hasLocalListingsCache()) return null

  const deals: Partial<Record<TmreTown, DealOfTheDayResponse>> = {}
  let generatedAt: string | null = null

  for (const town of TMRE_TOWNS) {
    const cached = await readDealOfTheDayCache(town, kind)
    if (!cached) return null
    deals[town] = cached
    if (!generatedAt || cached.generatedAt > generatedAt) {
      generatedAt = cached.generatedAt
    }
  }

  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    kind,
    deals,
    source: 'db',
    dealCache: true,
  }
}

export async function writeDealOfTheDayCache(
  scope: DealOfTheDayScope,
  payload: DealOfTheDayResponse,
  kind: DealOfTheDayKind = 'all',
): Promise<void> {
  await writeStatsCacheRow(dealOfTheDayCacheKey(scope, kind), payload)
}

const CACHE_KINDS: DealOfTheDayKind[] = ['sale', 'rental', 'all']

async function cacheScopedKinds(
  scope: DealOfTheDayScope,
  allListings: Listing[],
  boardScored: Awaited<ReturnType<typeof scoreActiveListingsForBoard>>,
  town: TmreTown | null,
): Promise<number> {
  let written = 0

  for (const kind of CACHE_KINDS) {
    const kindFilter = kind === 'all' ? undefined : kind
    let scoped = allListings
    if (kindFilter) {
      scoped = scoped.filter((l) => kindOf(l) === kindFilter)
    }
    if (!scoped.length) continue

    const payload = await pickDealOfTheDayFromBoardScored(scoped, boardScored)
    if (!payload) continue

    const response: DealOfTheDayResponse = {
      ...buildDealOfTheDayResponse(payload, town, kindFilter),
      photoUrl: payload.photoUrl || dealListingPhotoUrl(payload.listing),
      source: 'db',
      dealCache: true,
    }
    const warmed = await ensureDealPickPhotos(response)
    await writeDealOfTheDayCache(scope, { ...response, ...warmed }, kind)
    written += 1
  }

  return written
}

/** Re-warm hero + deck photos for any cached DOTD entries still missing blobs. */
export async function warmAllDealOfTheDayPhotos(): Promise<number> {
  if (!hasLocalListingsCache()) return 0

  let warmed = 0
  const scopes: DealOfTheDayScope[] = [...TMRE_TOWNS, 'All']

  for (const scope of scopes) {
    for (const kind of CACHE_KINDS) {
      const cached = await readDealOfTheDayCache(scope, kind)
      if (!cached || dealPickPhotosReady(cached)) continue
      const updated = await ensureDealPickPhotos(cached)
      await writeDealOfTheDayCache(
        scope,
        { ...cached, ...updated, source: 'db', dealCache: true },
        kind,
      )
      warmed += 1
    }
  }

  return warmed
}

/** Recompute Deal of the Day for every town × kind (and All) from SQLite. */
export async function rebuildDealOfTheDayCache(): Promise<{
  written: number
  durationMs: number
}> {
  const startedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache_started', startedAt)
  const t0 = Date.now()
  await clearCacheByPrefix(`${DEAL_OF_THE_DAY_CACHE_PREFIX}:`)
  // Drop legacy unscoped keys from v4.
  await clearCacheByPrefix('deal-of-the-day:v4:')

  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: Date.now() - t0 }
  }

  let written = 0

  for (const town of TMRE_TOWNS) {
    const { listings: peerPool } = await fetchActiveListingsForCity(
      town,
      SCORE_PEER_LIMIT,
    )
    const allListings = filterListingsToTmreTowns(peerPool)
    const activeAll = allListings.filter(isMarketListing)
    if (!activeAll.length) continue

    const boardScored = await scoreActiveListingsForBoard(activeAll, peerPool)
    written += await cacheScopedKinds(town, allListings, boardScored, town)
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
  const allListings = filterListingsToTmreTowns(allPeerPool)
  const activeAll = allListings.filter(isMarketListing)
  if (activeAll.length) {
    const boardScored = await scoreActiveListingsForBoard(activeAll, allPeerPool)
    written += await cacheScopedKinds('All', allListings, boardScored, null)
  }

  const photosWarmed = await warmAllDealOfTheDayPhotos()

  const generatedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache', generatedAt)
  console.info(
    `[deal-of-the-day-cache] rebuilt ${written} entries, ${photosWarmed} photo gaps filled, in ${Date.now() - t0}ms`,
  )

  return { written, durationMs: Date.now() - t0 }
}

/**
 * Warm deal picks when SQLite has listings but no cached entries yet (e.g. dev).
 * Skips while `refresh_in_progress` so it does not race the 5am full sync rebuild.
 */
export async function rebuildDealOfTheDayCacheIfMissing(): Promise<{
  written: number
  durationMs: number
  skipped?: boolean
}> {
  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (await readDealOfTheDayCache('Westport', 'sale')) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  return rebuildDealOfTheDayCache()
}
