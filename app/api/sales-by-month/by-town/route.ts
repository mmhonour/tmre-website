import { NextRequest, NextResponse } from 'next/server'
import { fetchClosedListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeSalesByMonth, type SalesByMonthByTownPayload } from '@/lib/stats-compute'
import {
  readSalesByMonthByTown,
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
  writeStatsCache,
} from '@/lib/stats-cache'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bundleFromTownCaches(kind: ListingKind): SalesByMonthByTownPayload | null {
  const towns = {} as Record<TmreTown, SalesByMonthByTownPayload['towns'][string]>
  let found = false
  for (const town of TMRE_TOWNS) {
    const row = readStatsCache<ReturnType<typeof computeSalesByMonth>>('sales-by-month', town, kind)
    if (row?.data) {
      towns[town] = row.data
      found = true
    }
  }
  return found ? { kind, towns } : null
}

async function bundleLive(kind: ListingKind): Promise<SalesByMonthByTownPayload> {
  const towns = {} as Record<TmreTown, SalesByMonthByTownPayload['towns'][string]>
  const results = await Promise.all(
    TMRE_TOWNS.map(async (town) => {
      const { listings } = await fetchClosedListingsForCity(town, 2500)
      return [town, computeSalesByMonth(listings, town, kind).data] as const
    }),
  )
  for (const [town, data] of results) {
    towns[town] = data
  }
  return { kind, towns }
}

export async function GET(req: NextRequest) {
  const kind = parseListingKindParam(new URL(req.url).searchParams.get('kind'))

  try {
    scheduleStatsCacheRebuildIfStale()

    let payload = readSalesByMonthByTown(kind)
    let servedFromCache = Boolean(payload)

    if (!payload) {
      payload = bundleFromTownCaches(kind)
      servedFromCache = Boolean(payload)
    }

    if (!payload) {
      const live = await bundleLive(kind)
      const generatedAt = new Date().toISOString()
      writeStatsCache('sales-by-month-by-town', 'All', kind, { ...live, generatedAt })
      return NextResponse.json(
        { ...live, generatedAt, source: 'rets', statsCache: false },
        { headers: { ...listingCacheHeaders('rets'), 'X-Stats-Cache': 'miss' } },
      )
    }

    const generatedAt =
      (payload as { generatedAt?: string }).generatedAt ?? new Date().toISOString()

    return NextResponse.json(
      {
        ...payload,
        generatedAt,
        source: 'db',
        statsCache: servedFromCache,
      },
      {
        headers: {
          ...listingCacheHeaders('db'),
          'X-Stats-Cache': servedFromCache ? 'hit' : 'partial',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
        },
      },
    )
  } catch (err) {
    console.error('[/api/sales-by-month/by-town] error', err)
    return NextResponse.json({ error: 'Failed to load sales by month by town' }, { status: 502 })
  }
}
