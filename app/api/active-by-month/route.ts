import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsForCity,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeActiveByMonth } from '@/lib/stats-compute'
import { statsMonthChartYears } from '@/lib/stats-month-years'
import {
  readAggregatedActiveByMonth,
  readStatsCache,
  writeStatsCache,
} from '@/lib/stats-cache'
import {
  fetchActiveListingsAcrossTowns,
  fetchClosedListingsAcrossTowns,
} from '@/lib/listings-store'

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
      const cached = readAggregatedActiveByMonth(kind)
      if (cached) {
        return NextResponse.json(
          {
            ...cached,
            source: 'db',
            statsCache: true,
            generatedAt: cached.generatedAt ?? new Date().toISOString(),
          },
          { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
        )
      }

      const [{ listings: active }, { listings: closed, source }] = await Promise.all([
        fetchActiveListingsAcrossTowns(TMRE_TOWNS, { limit: 2500 }),
        fetchClosedListingsAcrossTowns(TMRE_TOWNS, { limit: 2500 }),
      ])
      const payload = computeActiveByMonth(active, closed, 'All', kind)
      const generatedAt = new Date().toISOString()

      if (source === 'db') {
        writeStatsCache('active-by-month', 'All', kind, { ...payload, generatedAt })
      }

      return NextResponse.json(
        { ...payload, generatedAt, source, statsCache: false },
        { headers: listingCacheHeaders(source) },
      )
    }

    const cached = readStatsCache<ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }>(
      'active-by-month',
      city,
      kind,
    )
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          source: 'db',
          statsCache: true,
          generatedAt: cached.generatedAt ?? new Date().toISOString(),
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const [{ listings: active }, { listings: closed, source }] = await Promise.all([
      fetchActiveListingsForCity(city, 2500),
      fetchClosedListingsForCity(city, 2500),
    ])
    const payload = computeActiveByMonth(active, closed, city, kind)
    const generatedAt = new Date().toISOString()

    if (source === 'db') {
      writeStatsCache('active-by-month', city, kind, { ...payload, generatedAt })
    }

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/active-by-month] error', err)
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
  const scale = kind === 'rental' ? 0.14 : 1
  const base = (city === 'Westport' ? 48 : city === 'Wilton' ? 28 : city === 'Fairfield' ? 42 : 36) * scale
  const seasonal = [0.72, 0.74, 0.88, 1.02, 1.12, 1.08, 0.98, 0.92, 0.96, 1.0, 0.86, 0.68]
  const data: MonthlyCount[] = []
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  for (const year of YEARS) {
    const yearsFromStart = year - YEARS[0]
    const yFactor = 1 + yearsFromStart * 0.03
    const maxMonth = year < currentYear ? 12 : currentMonth
    for (let month = 1; month <= 12; month++) {
      const count = month <= maxMonth
        ? Math.round(base * seasonal[month - 1] * yFactor + (Math.random() * 4 - 2))
        : 0
      data.push({ year, month, count: Math.max(0, count) })
    }
  }
  return data
}
