import { NextRequest, NextResponse } from 'next/server'
import { fetchClosedListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeSalesByMonth } from '@/lib/stats-compute'
import { statsMonthChartYears } from '@/lib/stats-month-years'
import { readAggregatedSalesByMonth, readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import { fetchClosedListingsAcrossTowns } from '@/lib/listings-store'

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
      const cached = readAggregatedSalesByMonth(kind)
      if (cached) {
        return NextResponse.json(
          {
            ...cached,
            closedThisWeek: cached.closedThisWeek ?? 0,
            closedThisWeekByZip: cached.closedThisWeekByZip ?? {},
            source: 'db',
            statsCache: true,
            generatedAt: cached.generatedAt ?? new Date().toISOString(),
          },
          { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
        )
      }

      const { listings: raw, source } = await fetchClosedListingsAcrossTowns(TMRE_TOWNS, {
        limit: 2500,
      })
      const payload = computeSalesByMonth(raw, 'All', kind)
      const generatedAt = new Date().toISOString()

      if (source === 'db') {
        writeStatsCache('sales-by-month', 'All', kind, { ...payload, generatedAt })
      }

      return NextResponse.json(
        { ...payload, generatedAt, source, statsCache: false },
        { headers: listingCacheHeaders(source) },
      )
    }

    const cached = readStatsCache<ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }>(
      'sales-by-month',
      city,
      kind,
    )
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          closedThisWeek: cached.closedThisWeek ?? 0,
          closedThisWeekByZip: cached.closedThisWeekByZip ?? {},
          source: 'db',
          statsCache: true,
          generatedAt: cached.generatedAt ?? new Date().toISOString(),
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const { listings: raw, source } = await fetchClosedListingsForCity(city, 2500)
    const payload = computeSalesByMonth(raw, city, kind)
    const generatedAt = new Date().toISOString()

    if (source === 'db') {
      writeStatsCache('sales-by-month', city, kind, { ...payload, generatedAt })
    }

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/sales-by-month] error', err)
    return NextResponse.json({
      city,
      kind,
      data: generateFallback(city, kind),
      closedThisWeek: 0,
      closedThisWeekByZip: {},
      fallback: true,
      generatedAt: new Date().toISOString(),
    })
  }
}

function generateFallback(city: string, kind: ListingKind = 'sale'): MonthlyCount[] {
  const scale = kind === 'rental' ? 0.14 : 1
  const base = (city === 'Westport' ? 12 : city === 'Wilton' ? 6 : city === 'Fairfield' ? 10 : 14) * scale
  const seasonal = [0.55, 0.60, 0.80, 1.10, 1.30, 1.25, 1.05, 0.85, 0.95, 1.00, 0.75, 0.50]
  const data: MonthlyCount[] = []
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  for (const year of YEARS) {
    const yearsFromStart = year - YEARS[0]
    const yFactor = 1 + yearsFromStart * 0.04
    const maxMonth = year < currentYear ? 12 : currentMonth
    for (let month = 1; month <= 12; month++) {
      const count = month <= maxMonth
        ? Math.round(base * seasonal[month - 1] * yFactor + (Math.random() * 2 - 1))
        : 0
      data.push({ year, month, count: Math.max(0, count) })
    }
  }
  return data
}
