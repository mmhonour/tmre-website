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
import {
  listingMatchesPropertyClass,
  type ListingPropertyClass,
} from '@/lib/listing-property-class'
import type { Listing } from '@/lib/rets'
import { filterListingsToTmreTowns, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

/**
 * v6: 7 towns × sale/rental × homes/multi/condos = 42 cached picks.
 * Default page load is sale + homes (single-family homogenization).
 */
export const DEAL_OF_THE_DAY_CACHE_PREFIX = 'deal-of-the-day:v6'

export type DealOfTheDayScope = TmreTown
export type DealOfTheDayKind = 'sale' | 'rental'
/** Cached subtypes only — no "all" (that would reintroduce condo mix). */
export type DealOfTheDayPropertyClass = Exclude<ListingPropertyClass, 'all'>

export const DEAL_OF_THE_DAY_KINDS: readonly DealOfTheDayKind[] = ['sale', 'rental']
export const DEAL_OF_THE_DAY_PROPERTY_CLASSES: readonly DealOfTheDayPropertyClass[] = [
  'homes',
  'multi',
  'condos',
]

export type DealOfTheDayResponse = DealPickPayload & {
  scope: {
    towns: string[]
    city: TmreTown | null
    includesSales: boolean
    includesRentals: boolean
    belowTownMedian: boolean
    pickMode: DealPickPayload['pickMode']
    excludesNewConstruction: boolean
    propertyClass: DealOfTheDayPropertyClass
  }
  source?: 'db' | 'rets'
  dealCache?: boolean
}

export type DealOfTheDayBundleResponse = {
  generatedAt: string
  kind: DealOfTheDayKind
  propertyClass: DealOfTheDayPropertyClass
  deals: Partial<Record<TmreTown, DealOfTheDayResponse>>
  source: 'db'
  dealCache: true
}

export function dealOfTheDayCacheKey(
  scope: DealOfTheDayScope,
  kind: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): string {
  return `${DEAL_OF_THE_DAY_CACHE_PREFIX}:${scope}:${kind}:${propertyClass}`
}

export function buildDealOfTheDayResponse(
  payload: DealPickPayload,
  town: TmreTown | null,
  kindFilter: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): DealOfTheDayResponse {
  return {
    ...payload,
    scope: {
      towns: town ? [town] : [...TMRE_TOWNS],
      city: town,
      includesSales: kindFilter === 'sale',
      includesRentals: kindFilter === 'rental',
      belowTownMedian: payload.pickMode === 'below-median',
      pickMode: payload.pickMode,
      excludesNewConstruction: payload.pickMode === 'below-median',
      propertyClass,
    },
  }
}

export async function readDealOfTheDayCache(
  scope: DealOfTheDayScope,
  kind: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): Promise<DealOfTheDayResponse | null> {
  if (!(await hasLocalListingsCache())) return null
  const row = await readStatsCacheRow(dealOfTheDayCacheKey(scope, kind, propertyClass))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as DealOfTheDayResponse
  } catch {
    return null
  }
}

/**
 * Bundle of per-town DOTD cache rows for the carousel.
 * Returns whatever towns are already cached — does not require a full set
 * (missing towns used to null the whole bundle and force a slow recompute).
 */
export async function readDealOfTheDayBundle(
  kind: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): Promise<DealOfTheDayBundleResponse | null> {
  if (!(await hasLocalListingsCache())) return null

  const deals: Partial<Record<TmreTown, DealOfTheDayResponse>> = {}
  let generatedAt: string | null = null

  for (const town of TMRE_TOWNS) {
    const cached = await readDealOfTheDayCache(town, kind, propertyClass)
    if (!cached) continue
    deals[town] = cached
    if (!generatedAt || cached.generatedAt > generatedAt) {
      generatedAt = cached.generatedAt
    }
  }

  if (Object.keys(deals).length === 0) return null

  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    kind,
    propertyClass,
    deals,
    source: 'db',
    dealCache: true,
  }
}

export async function writeDealOfTheDayCache(
  scope: DealOfTheDayScope,
  payload: DealOfTheDayResponse,
  kind: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): Promise<void> {
  await writeStatsCacheRow(dealOfTheDayCacheKey(scope, kind, propertyClass), payload)
}

async function cacheScopedKinds(
  scope: DealOfTheDayScope,
  allListings: Listing[],
  boardScored: Awaited<ReturnType<typeof scoreActiveListingsForBoard>>,
  town: TmreTown,
): Promise<number> {
  let written = 0

  for (const kind of DEAL_OF_THE_DAY_KINDS) {
    for (const propertyClass of DEAL_OF_THE_DAY_PROPERTY_CLASSES) {
      const scoped = allListings.filter(
        (l) =>
          kindOf(l) === kind &&
          listingMatchesPropertyClass(l.propertyType ?? '', propertyClass),
      )
      if (!scoped.length) continue

      const payload = await pickDealOfTheDayFromBoardScored(scoped, boardScored)
      if (!payload) continue

      const response: DealOfTheDayResponse = {
        ...buildDealOfTheDayResponse(payload, town, kind, propertyClass),
        photoUrl: payload.photoUrl || dealListingPhotoUrl(payload.listing),
        source: 'db',
        dealCache: true,
      }
      const warmed = await ensureDealPickPhotos(response)
      await writeDealOfTheDayCache(scope, { ...response, ...warmed }, kind, propertyClass)
      written += 1
    }
  }

  return written
}

/** Re-warm hero + deck photos for any cached DOTD entries still missing blobs. */
export async function warmAllDealOfTheDayPhotos(): Promise<number> {
  if (!(await hasLocalListingsCache())) return 0

  let warmed = 0

  for (const scope of TMRE_TOWNS) {
    for (const kind of DEAL_OF_THE_DAY_KINDS) {
      for (const propertyClass of DEAL_OF_THE_DAY_PROPERTY_CLASSES) {
        const cached = await readDealOfTheDayCache(scope, kind, propertyClass)
        if (!cached || (await dealPickPhotosReady(cached))) continue
        const updated = await ensureDealPickPhotos(cached)
        await writeDealOfTheDayCache(
          scope,
          { ...cached, ...updated, source: 'db', dealCache: true },
          kind,
          propertyClass,
        )
        warmed += 1
      }
    }
  }

  return warmed
}

/** Recompute Deal of the Day for every town × kind × property class (42). */
export async function rebuildDealOfTheDayCache(): Promise<{
  written: number
  durationMs: number
}> {
  const startedAt = new Date().toISOString()
  setSyncMeta('last_deal_of_the_day_cache_started', startedAt)
  const t0 = Date.now()
  await clearCacheByPrefix(`${DEAL_OF_THE_DAY_CACHE_PREFIX}:`)
  // Drop legacy keys from earlier versions.
  await clearCacheByPrefix('deal-of-the-day:v5:')
  await clearCacheByPrefix('deal-of-the-day:v4:')

  if (!(await hasLocalListingsCache())) {
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
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (await readDealOfTheDayCache('Westport', 'sale', 'homes')) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  return rebuildDealOfTheDayCache()
}
