import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsForCity,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeMonthsSupplyByMonthByTown } from '@/lib/months-supply-by-month'
import { computeActiveByMonth, computeSalesByMonth } from '@/lib/stats-compute'
import {
  readActiveByMonthByTown,
  readSalesByMonthByTown,
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
} from '@/lib/stats-cache'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MonthlyCount = { year: number; month: number; count: number }

async function activeBundle(kind: ListingKind): Promise<Record<TmreTown, MonthlyCount[]> | null> {
  const cached = await readActiveByMonthByTown(kind)
  if (cached?.towns) return cached.towns as Record<TmreTown, MonthlyCount[]>

  const towns = {} as Record<TmreTown, MonthlyCount[]>
  let found = false
  for (const town of TMRE_TOWNS) {
    const row = await readStatsCache<{ data: MonthlyCount[] }>('active-by-month', town, kind)
    if (row?.data) {
      towns[town] = row.data
      found = true
    }
  }
  return found ? towns : null
}

async function salesBundle(kind: ListingKind): Promise<Record<TmreTown, MonthlyCount[]> | null> {
  const cached = await readSalesByMonthByTown(kind)
  if (cached?.towns) return cached.towns as Record<TmreTown, MonthlyCount[]>

  const towns = {} as Record<TmreTown, MonthlyCount[]>
  let found = false
  for (const town of TMRE_TOWNS) {
    const row = await readStatsCache<{ data: MonthlyCount[] }>('sales-by-month', town, kind)
    if (row?.data) {
      towns[town] = row.data
      found = true
    }
  }
  return found ? towns : null
}

async function liveBundles(kind: ListingKind): Promise<{
  active: Record<TmreTown, MonthlyCount[]>
  sales: Record<TmreTown, MonthlyCount[]>
}> {
  const active = {} as Record<TmreTown, MonthlyCount[]>
  const sales = {} as Record<TmreTown, MonthlyCount[]>
  await Promise.all(
    TMRE_TOWNS.map(async (town) => {
      const [{ listings: act }, { listings: closed }] = await Promise.all([
        fetchActiveListingsForCity(town, 2500),
        fetchClosedListingsForCity(town, 2500),
      ])
      active[town] = computeActiveByMonth(act, closed, town, kind).data
      sales[town] = computeSalesByMonth(closed, town, kind).data
    }),
  )
  return { active, sales }
}

export async function GET(req: NextRequest) {
  const kind = parseListingKindParam(new URL(req.url).searchParams.get('kind'))

  try {
    scheduleStatsCacheRebuildIfStale()

    let activeTowns = await activeBundle(kind)
    let salesTowns = await salesBundle(kind)
    let source: 'db' | 'rets' = 'db'
    let statsCache = true

    if (!activeTowns || !salesTowns) {
      const live = await liveBundles(kind)
      activeTowns = live.active
      salesTowns = live.sales
      source = 'rets'
      statsCache = false
    }

    const payload = computeMonthsSupplyByMonthByTown(
      activeTowns,
      salesTowns,
      kind,
      TMRE_TOWNS,
    )
    const generatedAt = new Date().toISOString()

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache },
      {
        headers: {
          ...listingCacheHeaders(source),
          'X-Stats-Cache': statsCache ? 'hit' : 'miss',
        },
      },
    )
  } catch (err) {
    console.error('[/api/months-supply-by-month/by-town] error', err)
    return NextResponse.json(
      { error: 'Failed to compute months supply by town' },
      { status: 500 },
    )
  }
}
