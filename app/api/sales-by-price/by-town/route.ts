import { NextRequest, NextResponse } from 'next/server'
import { readListingsFromDb } from '@/lib/db/listings-repo'
import { listingCacheHeaders } from '@/lib/listings-store'
import { parseListingKindParam } from '@/lib/listing-kind'
import { getPriceBucketsFresh } from '@/lib/price-buckets-config'
import { STATS_CLOSED_PERIOD_START } from '@/lib/stats-listing-rows'
import { computeSalesByPriceByTown } from '@/lib/stats-compute'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRENT_YEAR = new Date().getFullYear()

function parseYear(raw: string | null): number {
  const n = raw != null ? Number(raw) : NaN
  if (!Number.isFinite(n)) return CURRENT_YEAR
  const year = Math.trunc(n)
  if (year < STATS_CLOSED_PERIOD_START || year > CURRENT_YEAR) return CURRENT_YEAR
  return year
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kind = parseListingKindParam(searchParams.get('kind'))
  const year = parseYear(searchParams.get('year'))

  try {
    const saleBuckets = await getPriceBucketsFresh()
    const byTownClosed = {} as Record<TmreTown, Awaited<ReturnType<typeof readListingsFromDb>>>
    await Promise.all(
      TMRE_TOWNS.map(async (town) => {
        byTownClosed[town] = await readListingsFromDb(town, 'Closed')
      }),
    )

    const payload = computeSalesByPriceByTown(
      byTownClosed,
      kind,
      TMRE_TOWNS,
      saleBuckets,
      year,
    )

    return NextResponse.json(
      {
        ...payload,
        generatedAt: new Date().toISOString(),
        source: 'db',
        statsCache: false,
      },
      { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'miss' } },
    )
  } catch (err) {
    console.error('[/api/sales-by-price/by-town] error', err)
    return NextResponse.json(
      { error: 'Failed to compute sales by price by town' },
      { status: 500 },
    )
  }
}
