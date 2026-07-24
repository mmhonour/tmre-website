import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsAcrossTowns,
  fetchActiveListingsForCity,
  fetchClosedListingsAcrossTowns,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeMonthsSupplyByMonth } from '@/lib/months-supply-by-month'
import { computeActiveByMonth, computeSalesByMonth } from '@/lib/stats-compute'
import { statsMonthChartYears } from '@/lib/stats-month-years'
import {
  readAggregatedActiveByMonth,
  readAggregatedSalesByMonth,
  readStatsCache,
  writeStatsCache,
} from '@/lib/stats-cache'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = [...TMRE_TOWNS, 'All'] as string[]
const YEARS = statsMonthChartYears()

type MonthlyCount = { year: number; month: number; count: number }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? 'Westport').trim()

  if (!SUPPORTED_CITIES.includes(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    if (city === 'All') {
      const [activeCached, salesCached] = await Promise.all([
        readAggregatedActiveByMonth(kind),
        readAggregatedSalesByMonth(kind),
      ])
      if (activeCached?.data?.length && salesCached?.data?.length) {
        const payload = computeMonthsSupplyByMonth(
          activeCached.data,
          salesCached.data,
          'All',
          kind,
        )
        const generatedAt =
          activeCached.generatedAt ??
          salesCached.generatedAt ??
          new Date().toISOString()
        return NextResponse.json(
          {
            ...payload,
            source: 'db',
            statsCache: true,
            generatedAt,
          },
          { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
        )
      }

      const [{ listings: active }, { listings: closed, source }] = await Promise.all([
        fetchActiveListingsAcrossTowns(TMRE_TOWNS, { limit: 2500 }),
        fetchClosedListingsAcrossTowns(TMRE_TOWNS, { limit: 2500 }),
      ])
      const activePayload = computeActiveByMonth(active, closed, 'All', kind)
      const salesPayload = computeSalesByMonth(closed, 'All', kind)
      const payload = computeMonthsSupplyByMonth(
        activePayload.data,
        salesPayload.data,
        'All',
        kind,
      )
      const generatedAt = new Date().toISOString()
      return NextResponse.json(
        { ...payload, generatedAt, source, statsCache: false },
        { headers: listingCacheHeaders(source) },
      )
    }

    const [activeCached, salesCached] = await Promise.all([
      readStatsCache<ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }>(
        'active-by-month',
        city,
        kind,
      ),
      readStatsCache<ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }>(
        'sales-by-month',
        city,
        kind,
      ),
    ])

    if (activeCached?.data?.length && salesCached?.data?.length) {
      const payload = computeMonthsSupplyByMonth(
        activeCached.data,
        salesCached.data,
        city,
        kind,
      )
      const generatedAt =
        activeCached.generatedAt ??
        salesCached.generatedAt ??
        new Date().toISOString()
      return NextResponse.json(
        {
          ...payload,
          source: 'db',
          statsCache: true,
          generatedAt,
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const [{ listings: active }, { listings: closed, source }] = await Promise.all([
      fetchActiveListingsForCity(city, 2500),
      fetchClosedListingsForCity(city, 2500),
    ])
    const activePayload = computeActiveByMonth(active, closed, city, kind)
    const salesPayload = computeSalesByMonth(closed, city, kind)
    const payload = computeMonthsSupplyByMonth(
      activePayload.data,
      salesPayload.data,
      city,
      kind,
    )
    const generatedAt = new Date().toISOString()

    if (source === 'db') {
      await Promise.all([
        writeStatsCache('active-by-month', city, kind, {
          ...activePayload,
          generatedAt,
        }),
        writeStatsCache('sales-by-month', city, kind, {
          ...salesPayload,
          generatedAt,
        }),
      ])
    }

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/months-supply-by-month] error', err)
    return NextResponse.json({
      city,
      kind,
      data: generateFallback(city, kind),
      fallback: true,
      generatedAt: new Date().toISOString(),
    })
  }
}

function generateFallback(city: string, kind: ListingKind = 'sale'): MonthlyCount[] {
  const scale = kind === 'rental' ? 1.15 : 1
  const base =
    (city === 'Westport' ? 4.2 : city === 'Wilton' ? 3.6 : city === 'Fairfield' ? 3.1 : 3.4) *
    scale
  const seasonal = [1.15, 1.1, 0.95, 0.85, 0.8, 0.88, 0.95, 1.0, 1.05, 1.1, 1.18, 1.22]
  const data: MonthlyCount[] = []
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  for (const year of YEARS) {
    const yearsFromStart = year - YEARS[0]
    const yFactor = 1 - yearsFromStart * 0.02
    const maxMonth = year < currentYear ? 12 : currentMonth
    for (let month = 1; month <= 12; month++) {
      const count =
        month <= maxMonth
          ? Math.round(base * seasonal[month - 1] * yFactor * 10) / 10
          : 0
      data.push({ year, month, count: Math.max(0, count) })
    }
  }
  return data
}
