import { NextRequest, NextResponse } from 'next/server'
import { readAllListingsFromDb, readListingsFromDb } from '@/lib/db/listings-repo'
import { listingCacheHeaders } from '@/lib/listings-store'
import { getInventorySegmentBandsConfigFresh } from '@/lib/inventory-segment-bands-config'
import { getPriceBucketsFresh } from '@/lib/price-buckets-config'
import {
  computeActiveBySegmentPrice,
  type ActiveByLuxuryPricePayload,
} from '@/lib/stats-compute'
import {
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
  writeStatsCache,
} from '@/lib/stats-cache'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CachedActiveByLuxuryPrice = ActiveByLuxuryPricePayload & {
  generatedAt?: string
}

/**
 * Active luxury inventory counts ($4–10M @ $1M, $10M+ @ $5M).
 * Prefer stats_cache; on miss seed from Postgres listings (never RETS).
 * Sale-only. Keys off the top 3 Admin sale price bands.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (town name or "All")' },
      { status: 400 },
    )
  }

  if (city !== 'All' && !isTmreTown(city)) {
    return NextResponse.json(
      { error: `Unsupported city '${city}'` },
      { status: 400 },
    )
  }

  try {
    const cached = await readStatsCache<CachedActiveByLuxuryPrice>(
      'active-by-luxury-price',
      city,
      'sale',
    )
    if (cached?.buckets) {
      return NextResponse.json(
        {
          ...cached,
          source: 'db',
          statsCache: true,
          generatedAt: cached.generatedAt ?? new Date().toISOString(),
        },
        {
          headers: {
            ...listingCacheHeaders('db'),
            'X-Stats-Cache': 'hit',
          },
        },
      )
    }

    scheduleStatsCacheRebuildIfStale(true)

    const active =
      city === 'All'
        ? await readAllListingsFromDb(TMRE_TOWNS, 'Active')
        : await readListingsFromDb(city, 'Active', 500)

    const saleBuckets = await getPriceBucketsFresh()
    const inventoryConfig = await getInventorySegmentBandsConfigFresh()
    const luxury = inventoryConfig.segments.find((s) => s.id === 'luxury')!
    const payload = computeActiveBySegmentPrice(
      active,
      city,
      {
        id: luxury.id,
        label: luxury.label,
        min: luxury.min,
        max: luxury.max,
        steps: luxury.steps.filter((b) => !b.hidden),
      },
      saleBuckets,
    )
    const generatedAt = new Date().toISOString()
    await writeStatsCache('active-by-luxury-price', city, 'sale', {
      ...payload,
      generatedAt,
    })

    return NextResponse.json(
      { ...payload, generatedAt, source: 'db', statsCache: false },
      {
        headers: {
          ...listingCacheHeaders('db'),
          'X-Stats-Cache': 'seed',
        },
      },
    )
  } catch (err) {
    console.error('[/api/active-by-luxury-price] error', err)
    return NextResponse.json(
      { error: 'Failed to load luxury inventory by price band' },
      { status: 502 },
    )
  }
}
