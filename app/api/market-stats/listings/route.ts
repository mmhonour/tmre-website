import { NextRequest, NextResponse } from 'next/server'
import {
  fetchClosedListingsForCity,
  listingCacheHeaders,
  type ListingsSource,
} from '@/lib/listings-store'
import {
  filterListingsByKind,
  parseListingKindParam,
  type ListingKind,
} from '@/lib/listing-kind'
import { readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import {
  isTransactToListRow,
  listingToStatsRow,
  type StatsListingRow,
} from '@/lib/stats-listing-rows'
import { formatTownList, TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED_CITIES = TMRE_TOWNS

function listingsNeedOriginalAsk(rows: StatsListingRow[]): boolean {
  return rows.some((row) => !Object.prototype.hasOwnProperty.call(row, 'originalListPrice'))
}

function sortByDateDesc(rows: StatsListingRow[]): StatsListingRow[] {
  return [...rows].sort((a, b) => {
    const aMs = a.listDate ? Date.parse(a.listDate) : 0
    const bMs = b.listDate ? Date.parse(b.listDate) : 0
    return bMs - aMs
  })
}

async function loadListingRows(
  city: string,
  kind: ListingKind,
): Promise<{
  rows: StatsListingRow[]
  source: ListingsSource
  statsCache: boolean
  generatedAt: string | null
}> {
  const cached = await readStatsCache<{ listings: StatsListingRow[]; generatedAt?: string }>(
    'market-stats-listings',
    city,
    kind,
  )
  if (cached?.listings && !listingsNeedOriginalAsk(cached.listings)) {
    return {
      rows: cached.listings,
      source: 'db',
      statsCache: true,
      generatedAt: cached.generatedAt ?? null,
    }
  }

  const { listings: raw, source } = await fetchClosedListingsForCity(city, 2500)
  const listings = filterListingsByKind(raw, kind)
  const rows = sortByDateDesc(
    listings
      .map((l) => listingToStatsRow(l, city, kind))
      .filter((row): row is StatsListingRow => row != null),
  )

  if (source === 'db') {
    const generatedAt = new Date().toISOString()
    await writeStatsCache('market-stats-listings', city, kind, {
      listings: rows,
      generatedAt,
    })
    return { rows, source, statsCache: false, generatedAt }
  }

  return { rows, source, statsCache: false, generatedAt: null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()
  const view = searchParams.get('view')

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
    const loaded = await loadListingRows(city, kind)
    const listings =
      view === 'transact-to-list'
        ? loaded.rows.filter(isTransactToListRow)
        : loaded.rows

    return NextResponse.json(
      {
        city,
        kind,
        view: view === 'transact-to-list' ? 'transact-to-list' : 'median',
        listings,
        count: listings.length,
        source: loaded.source,
        statsCache: loaded.statsCache,
        generatedAt: loaded.generatedAt,
      },
      {
        headers: {
          ...listingCacheHeaders(loaded.source),
          'X-Stats-Cache': loaded.statsCache ? 'hit' : 'miss',
        },
      },
    )
  } catch (err) {
    console.error('[/api/market-stats/listings] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listings for median price detail' },
      { status: 502 },
    )
  }
}
