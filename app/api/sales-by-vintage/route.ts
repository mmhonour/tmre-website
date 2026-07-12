import { NextRequest, NextResponse } from 'next/server'
import {
  fetchClosedListingsAcrossTowns,
  fetchClosedListingsForCity,
  listingCacheHeaders,
} from '@/lib/listings-store'
import { parseListingKindParam, type ListingKind } from '@/lib/listing-kind'
import { computeSalesByVintage } from '@/lib/stats-compute'
import { readStatsCache, writeStatsCache } from '@/lib/stats-cache'
import {
  VINTAGE_BUCKETS,
  emptyVintageCounts,
  type VintageBucketId,
} from '@/lib/vintage-buckets'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRENT_YEAR = new Date().getFullYear()
const PERIOD_START = 2024

function generateFallback(city: string, kind: ListingKind = 'sale') {
  const scale = kind === 'rental' ? 0.14 : 1
  const weights: Record<VintageBucketId, number> = {
    'pre-1900': city === 'Westport' || city === 'New Canaan' ? 0.06 : 0.04,
    '1900-1940': city === 'Westport' || city === 'New Canaan' ? 0.18 : 0.12,
    '1941-1970': 0.28,
    '1970-1990': 0.26,
    '1991-2010': 0.12,
    '2010-2020': 0.05,
    '2020-present': 0.03,
    unknown: 0.04,
  }

  const base =
    (city === 'Westport'
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
                  : 300) * scale

  const counts = emptyVintageCounts()
  let total = 0
  for (const b of VINTAGE_BUCKETS) {
    const n = Math.max(0, Math.round(base * weights[b.id] + (Math.random() * 4 - 2)))
    counts[b.id] = n
    total += n
  }
  counts.unknown = Math.max(0, Math.round(base * weights.unknown))

  const knownTotal = total
  const buckets = VINTAGE_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    count: counts[b.id],
    share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
  }))
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    totalSales: total + counts.unknown,
    knownYearBuilt: knownTotal,
    unknownYearBuilt: counts.unknown,
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
    const cached = await readStatsCache<
      ReturnType<typeof computeSalesByVintage> & { generatedAt?: string }
    >('sales-by-vintage', city, kind)
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

    const payload = computeSalesByVintage(raw, city, kind)
    const generatedAt = new Date().toISOString()

    if (source === 'db') {
      await writeStatsCache('sales-by-vintage', city, kind, { ...payload, generatedAt })
    }

    return NextResponse.json(
      { ...payload, generatedAt, source, statsCache: false },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/sales-by-vintage] error', err)
    if (city === 'All') {
      const merged = generateFallback('Norwalk', kind)
      for (const town of TMRE_TOWNS.slice(1)) {
        const part = generateFallback(town, kind)
        merged.totalSales += part.totalSales
        merged.knownYearBuilt += part.knownYearBuilt
        merged.unknownYearBuilt += part.unknownYearBuilt
        merged.buckets = merged.buckets.map((b, i) => ({
          ...b,
          count: b.count + part.buckets[i].count,
        }))
      }
      const knownTotal = merged.knownYearBuilt
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
