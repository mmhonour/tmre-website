import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsForCity,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeMarketStats, computeSalesByVintage } from '@/lib/stats-compute'
import {
  computeTownBundleFromListings,
  getStatsCacheAgeMs,
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
  STATS_CACHE_TTL_MS,
} from '@/lib/stats-cache'
import type { StatsListingRow } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type MarketStatsPayload = ReturnType<typeof computeMarketStats> & { generatedAt?: string }
type VintagePayload = ReturnType<typeof computeSalesByVintage> & { generatedAt?: string }
type ListingsPayload = { listings: StatsListingRow[]; generatedAt?: string }

export type StatsPageTownPayload = {
  marketStats: MarketStatsPayload | null
  vintage: VintagePayload | null
  medianListings: StatsListingRow[]
}

export type StatsPageResponse = {
  kind: ListingKind
  generatedAt: string | null
  cacheAgeMs: number | null
  cacheTtlMs: number
  statsCache: boolean
  towns: Record<TmreTown, StatsPageTownPayload>
}

async function readTownBundle(town: TmreTown, kind: ListingKind): Promise<StatsPageTownPayload> {
  const marketStats = await readStatsCache<MarketStatsPayload>('market-stats', town, kind)
  const vintage = await readStatsCache<VintagePayload>('sales-by-vintage', town, kind)
  const listingsPayload = await readStatsCache<ListingsPayload>('market-stats-listings', town, kind)
  return {
    marketStats,
    vintage,
    medianListings: listingsPayload?.listings ?? [],
  }
}

async function fetchTownBundleLive(town: TmreTown, kind: ListingKind): Promise<StatsPageTownPayload> {
  const [activeResult, closedResult] = await Promise.all([
    fetchActiveListingsForCity(town, 500),
    fetchClosedListingsForCity(town, 2500).catch((err) => {
      console.warn(`[/api/stats/page] closed listings for ${town} failed`, err)
      return { listings: [], source: 'rets' as const }
    }),
  ])
  const bundle = computeTownBundleFromListings(
    town,
    kind,
    activeResult.listings,
    closedResult.listings,
  )
  return bundle
}

export async function GET(req: NextRequest) {
  const kind = parseListingKindParam(new URL(req.url).searchParams.get('kind'))

  try {
    scheduleStatsCacheRebuildIfStale()

    const towns = Object.fromEntries(
      await Promise.all(
        TMRE_TOWNS.map(async (town) => [town, await readTownBundle(town, kind)] as const),
      ),
    ) as Record<TmreTown, StatsPageTownPayload>

    const stillEmpty = !TMRE_TOWNS.some(
      (town) => towns[town].marketStats?.medianPrice != null,
    )
    if (stillEmpty) {
      const live = await Promise.all(
        TMRE_TOWNS.map(async (town) => [town, await fetchTownBundleLive(town, kind)] as const),
      )
      Object.assign(towns, Object.fromEntries(live))
    }

    const marketByTown = await Promise.all(
      TMRE_TOWNS.map((town) => readStatsCache<MarketStatsPayload>('market-stats', town, kind)),
    )
    const servedFromCache = marketByTown.some((cached) => cached?.medianPrice != null)

    const generatedAt =
      towns[TMRE_TOWNS[0]]?.marketStats?.generatedAt ??
      towns[TMRE_TOWNS[0]]?.vintage?.generatedAt ??
      null

    return NextResponse.json(
      {
        kind,
        generatedAt,
        cacheAgeMs: getStatsCacheAgeMs(),
        cacheTtlMs: STATS_CACHE_TTL_MS,
        statsCache: servedFromCache,
        towns,
      } satisfies StatsPageResponse,
      {
        headers: {
          ...listingCacheHeaders(servedFromCache ? 'db' : 'rets'),
          'X-Stats-Cache': servedFromCache ? 'hit' : 'live',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
        },
      },
    )
  } catch (err) {
    console.error('[/api/stats/page] error', err)
    return NextResponse.json({ error: 'Failed to load stats page bundle' }, { status: 502 })
  }
}
