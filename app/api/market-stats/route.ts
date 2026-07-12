import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsForCity,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeMarketStats } from '@/lib/stats-compute'
import { readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import type { Listing } from '@/lib/rets'
import { formatTownList, TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = TMRE_TOWNS

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (e.g. ?city=Norwalk)' },
      { status: 400 },
    )
  }
  if (!(SUPPORTED_CITIES as readonly string[]).includes(city)) {
    return NextResponse.json(
      {
        error: `Unsupported city '${city}'. Supported: ${formatTownList(SUPPORTED_CITIES)}`,
      },
      { status: 400 },
    )
  }

  const kind: ListingKind = parseListingKindParam(searchParams.get('kind'))

  try {
    const cached = await readStatsCache<ReturnType<typeof computeMarketStats> & { generatedAt?: string }>(
      'market-stats',
      city,
      kind,
    )
    if (cached?.medianPrice != null) {
      return NextResponse.json(
        { ...cached, source: 'db', statsCache: true },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const [activeResult, closedResult] = await Promise.all([
      fetchActiveListingsForCity(city, 500),
      fetchClosedListingsForCity(city, 2500).catch((err) => {
        console.warn(`[/api/market-stats] closed listings for ${city} failed`, err)
        return { listings: [] as Listing[], source: 'rets' as const }
      }),
    ])
    const source =
      activeResult.source === 'db' && closedResult.source === 'db' ? 'db' : 'rets'
    const payload = computeMarketStats(
      activeResult.listings,
      city,
      kind,
      closedResult.listings,
    )

    if (source === 'db') {
      await writeStatsCache('market-stats', city, kind, {
        ...payload,
        generatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json(
      { ...payload, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/market-stats] error', err)
    return NextResponse.json(
      { error: 'Failed to compute market stats from MLS' },
      { status: 502 },
    )
  }
}
