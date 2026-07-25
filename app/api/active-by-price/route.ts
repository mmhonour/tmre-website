import { NextRequest, NextResponse } from 'next/server'
import { readAllListingsFromDb, readListingsFromDb } from '@/lib/db/listings-repo'
import { parseListingKindParam } from '@/lib/listing-kind'
import { listingCacheHeaders } from '@/lib/listings-store'
import { getPriceBucketsFresh } from '@/lib/price-buckets-config'
import {
  computeActiveByPrice,
  type ActiveByPricePayload,
} from '@/lib/stats-compute'
import {
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
  writeStatsCache,
} from '@/lib/stats-cache'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CachedActiveByPrice = ActiveByPricePayload & { generatedAt?: string }

/**
 * Active inventory counts by Sales/Rent price bands.
 * Prefer stats_cache; on miss fill once from Postgres listings (never RETS).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json({ error: 'city is required (town name or "All")' }, { status: 400 })
  }

  if (city !== 'All' && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    const cached = await readStatsCache<CachedActiveByPrice>('active-by-price', city, kind)
    if (cached?.buckets) {
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

    // Cache miss: seed from Postgres actives only (no RETS), then serve.
    scheduleStatsCacheRebuildIfStale(true)

    const active =
      city === 'All'
        ? await readAllListingsFromDb(TMRE_TOWNS, 'Active')
        : await readListingsFromDb(city, 'Active', 500)

    const saleBuckets = await getPriceBucketsFresh()
    const payload = computeActiveByPrice(active, city, kind, saleBuckets)
    const generatedAt = new Date().toISOString()
    await writeStatsCache('active-by-price', city, kind, { ...payload, generatedAt })

    return NextResponse.json(
      { ...payload, generatedAt, source: 'db', statsCache: false },
      { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'seed' } },
    )
  } catch (err) {
    console.error('[/api/active-by-price] error', err)
    return NextResponse.json(
      { error: 'Failed to load active inventory by price band' },
      { status: 502 },
    )
  }
}
