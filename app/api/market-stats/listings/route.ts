import { NextRequest, NextResponse } from 'next/server'
import { fetchClosedListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import {
  filterListingsByKind,
  parseListingKindParam,
  type ListingKind,
} from '@/lib/listing-kind'
import { readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import { listingToStatsRow } from '@/lib/stats-listing-rows'
import { formatTownList, TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = TMRE_TOWNS

export type MedianListingRow = {
  mlsId: string
  listingKey: string | null
  town: string
  address: string
  price: number | null
  closedPrice: number | null
  listDate: string | null
  dom: number | null
  sqft: number | null
  beds: number | null
  baths: number | null
}

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

  try {
    const kind: ListingKind = parseListingKindParam(searchParams.get('kind'))

    const cached = await readStatsCache<{ listings: MedianListingRow[]; generatedAt?: string }>(
      'market-stats-listings',
      city,
      kind,
    )
    if (cached?.listings) {
      return NextResponse.json(
        {
          city,
          kind,
          listings: cached.listings,
          count: cached.listings.length,
          source: 'db',
          statsCache: true,
          generatedAt: cached.generatedAt ?? null,
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const { listings: raw, source } = await fetchClosedListingsForCity(city, 2500)
    const listings = filterListingsByKind(raw, kind)
    const rows: MedianListingRow[] = listings
      .map((l) => listingToStatsRow(l, city, kind))
      .filter((row): row is MedianListingRow => row != null)
      .sort((a, b) => {
        const aMs = a.listDate ? Date.parse(a.listDate) : 0
        const bMs = b.listDate ? Date.parse(b.listDate) : 0
        return bMs - aMs
      })

    if (source === 'db') {
      await writeStatsCache('market-stats-listings', city, kind, {
        listings: rows,
        generatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json(
      { city, kind, listings: rows, count: rows.length, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/market-stats/listings] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listings for median price detail' },
      { status: 502 },
    )
  }
}
