import { NextRequest, NextResponse } from 'next/server'
import { listingCacheHeaders } from '@/lib/listings-store'
import { parseListingKindParam } from '@/lib/listing-kind'
import { parseListingPropertyClass } from '@/lib/listing-property-class'
import {
  expectedMonthsSupplyCacheCount,
  readMonthsSupplyCached,
  readMonthsSupplyIndex,
} from '@/lib/months-supply-cache'
import { scheduleStatsCacheRebuildIfStale } from '@/lib/stats-cache'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = [...TMRE_TOWNS, 'All'] as string[]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const wantIndex = searchParams.get('index') === '1' || searchParams.get('bundle') === '1'

  try {
    if (wantIndex) {
      const index = await readMonthsSupplyIndex()
      if (!index) {
        scheduleStatsCacheRebuildIfStale(true)
        return NextResponse.json(
          {
            error: 'Months supply cache not ready',
            expectedCount: expectedMonthsSupplyCacheCount(true),
          },
          { status: 503 },
        )
      }
      return NextResponse.json(
        {
          ...index,
          source: 'db',
          statsCache: true,
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const city = (searchParams.get('city') ?? 'Westport').trim()
    if (!SUPPORTED_CITIES.includes(city)) {
      return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
    }
    const kind = parseListingKindParam(searchParams.get('kind'))
    const propertyClass = parseListingPropertyClass(searchParams.get('property'))

    const cached = await readMonthsSupplyCached(city, kind, propertyClass)
    if (!cached) {
      scheduleStatsCacheRebuildIfStale(true)
      return NextResponse.json(
        {
          error: 'Months supply not cached for this combination',
          city,
          kind,
          propertyClass,
          expectedCount: expectedMonthsSupplyCacheCount(true),
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { ...cached, source: 'db', statsCache: true },
      { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
    )
  } catch (err) {
    console.error('[api/months-supply]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Months supply failed' },
      { status: 500 },
    )
  }
}
