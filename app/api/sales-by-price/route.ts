import { NextRequest, NextResponse } from 'next/server'
import {
  fetchClosedListingsAcrossTowns,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'
import {
  emptyPriceCounts,
  PRICE_BUCKETS,
  type PriceBucketId,
} from '@/lib/price-buckets'
import {
  emptyRentCounts,
  RENT_BUCKETS,
  type RentBucketId,
} from '@/lib/rent-buckets'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeSalesByPrice } from '@/lib/stats-compute'
import { readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import { STATS_CLOSED_PERIOD_START } from '@/lib/stats-listing-rows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRENT_YEAR = new Date().getFullYear()
const PERIOD_START = STATS_CLOSED_PERIOD_START

type PriceStatsBucket = {
  id: string
  label: string
  count: number
  share: number
}

type PriceStatsFallback = {
  totalSales: number
  knownPrice: number
  unknownPrice: number
  buckets: PriceStatsBucket[]
  topBucket: PriceStatsBucket | null
}

function generateFallback(city: string, kind: ListingKind = 'sale'): PriceStatsFallback {
  if (kind === 'rental') {
    const weights: Record<RentBucketId, number> = {
      '0-2k': city === 'Norwalk' || city === 'Fairfield' ? 0.2 : 0.1,
      '2k-4k': 0.38,
      '4k-6k': 0.24,
      '6k-8k': 0.1,
      '8k-12k': city === 'Westport' || city === 'New Canaan' ? 0.1 : 0.05,
      '12k-plus': city === 'Westport' || city === 'New Canaan' ? 0.06 : 0.02,
      unknown: 0.02,
    }
    const base =
      city === 'Westport' || city === 'New Canaan'
        ? 48
        : city === 'Norwalk' || city === 'Fairfield'
          ? 62
          : 38
    const counts = emptyRentCounts()
    let total = 0
    for (const b of RENT_BUCKETS) {
      const n = Math.max(0, Math.round(base * weights[b.id] + (Math.random() * 2 - 1)))
      counts[b.id] = n
      total += n
    }
    counts.unknown = Math.max(0, Math.round(base * weights.unknown))
    const knownTotal = total
    const buckets = RENT_BUCKETS.map((b) => ({
      id: b.id,
      label: b.label,
      count: counts[b.id],
      share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
    }))
    const ranked = [...buckets].sort((a, b) => b.count - a.count)
    return {
      totalSales: total + counts.unknown,
      knownPrice: knownTotal,
      unknownPrice: counts.unknown,
      buckets,
      topBucket: ranked[0]?.count ? ranked[0] : null,
    }
  }

  const weights: Record<PriceBucketId, number> =
    city === 'Westport' || city === 'New Canaan'
      ? {
          '0-500k': 0.04,
          '500k-1.249m': 0.14,
          '1.5m-2.25m': 0.28,
          '2.25m-3m': 0.22,
          '3m-4m': 0.16,
          '4m-6m': 0.1,
          '6m-10m': 0.04,
          '10m-plus': 0.01,
          unknown: 0.01,
        }
      : city === 'Norwalk' || city === 'Fairfield'
        ? {
            '0-500k': 0.08,
            '500k-1.249m': 0.42,
            '1.5m-2.25m': 0.28,
            '2.25m-3m': 0.12,
            '3m-4m': 0.06,
            '4m-6m': 0.03,
            '6m-10m': 0.005,
            '10m-plus': 0.005,
            unknown: 0.01,
          }
        : {
            '0-500k': 0.05,
            '500k-1.249m': 0.22,
            '1.5m-2.25m': 0.34,
            '2.25m-3m': 0.2,
            '3m-4m': 0.1,
            '4m-6m': 0.06,
            '6m-10m': 0.02,
            '10m-plus': 0.005,
            unknown: 0.005,
          }

  const base =
    city === 'Westport'
      ? 320
      : city === 'Norwalk'
        ? 380
        : city === 'Fairfield'
          ? 350
          : city === 'Wilton'
            ? 180
            : city === 'Weston'
              ? 140
              : city === 'New Canaan'
                ? 200
                : city === 'Ridgefield'
                  ? 170
                  : 300

  const counts = emptyPriceCounts()
  let total = 0
  for (const b of PRICE_BUCKETS) {
    const n = Math.max(0, Math.round(base * weights[b.id] + (Math.random() * 4 - 2)))
    counts[b.id] = n
    total += n
  }
  counts.unknown = Math.max(0, Math.round(base * weights.unknown))

  const knownTotal = total
  const buckets = PRICE_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    count: counts[b.id],
    share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
  }))
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    totalSales: total + counts.unknown,
    knownPrice: knownTotal,
    unknownPrice: counts.unknown,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

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
    const cached = readStatsCache<
      ReturnType<typeof computeSalesByPrice> & { generatedAt?: string }
    >('sales-by-price', city, kind)
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

    const { listings: raw, source } =
      city === 'All'
        ? await fetchClosedListingsAcrossTowns(TMRE_TOWNS, {
            limit: 2500,
          })
        : await fetchClosedListingsForCity(city, 2500)

    const payload = computeSalesByPrice(raw, city, kind)
    const generatedAt = new Date().toISOString()

    if (source === 'db') {
      writeStatsCache('sales-by-price', city, kind, { ...payload, generatedAt })
    }

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/sales-by-price] error', err)
    if (city === 'All') {
      const merged = generateFallback('Norwalk', kind)
      for (const town of TMRE_TOWNS.slice(1)) {
        const part = generateFallback(town, kind)
        merged.totalSales += part.totalSales
        merged.knownPrice += part.knownPrice
        merged.unknownPrice += part.unknownPrice
        merged.buckets = merged.buckets.map((b, i) => ({
          ...b,
          count: b.count + part.buckets[i].count,
        }))
      }
      const knownTotal = merged.knownPrice
      merged.buckets = merged.buckets.map((b) => ({
        ...b,
        share: knownTotal > 0 ? b.count / knownTotal : 0,
      }))
      const ranked = [...merged.buckets].sort((a, b) => b.count - a.count)
      merged.topBucket = ranked[0]?.count ? ranked[0] : null

      return NextResponse.json({
        city,
        kind,
        period: `${PERIOD_START}–${CURRENT_YEAR}`,
        ...merged,
        fallback: true,
        generatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      city,
      kind,
      period: `${PERIOD_START}–${CURRENT_YEAR}`,
      ...generateFallback(city, kind),
      fallback: true,
      generatedAt: new Date().toISOString(),
    })
  }
}
