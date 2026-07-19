import { NextRequest, NextResponse } from 'next/server'
import { fetchActiveListingsForCity, listingCacheHeaders, type ListingsSource } from '@/lib/listings-store'
import { computeDealOfTheDay, type DealPickPayload } from '@/lib/deal-pick'
import { SCORE_PEER_LIMIT } from '@/lib/goldilocks'
import {
  buildDealOfTheDayResponse,
  readDealOfTheDayBundle,
  readDealOfTheDayCache,
  writeDealOfTheDayCache,
  type DealOfTheDayKind,
  type DealOfTheDayScope,
  type DealOfTheDayResponse,
} from '@/lib/deal-of-the-day-cache'
import { dealPickPhotosReady, ensureDealPickPhotos } from '@/lib/deal-hero-photo-warm'
import {
  filterListingsToTmreTowns,
  isTmreTown,
  listingInTmreCoverage,
  normalizeTownName,
  TMRE_TOWNS,
  type TmreTown,
} from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveTown(cityParam: string | null): TmreTown | null {
  if (!cityParam?.trim() || cityParam.trim().toLowerCase() === 'all') return null
  const normalized = normalizeTownName(cityParam)
  if (!normalized || !isTmreTown(normalized)) return null
  return TMRE_TOWNS.find((t) => t.toLowerCase() === normalized.toLowerCase()) ?? null
}

function resolveKindParam(raw: string | null): 'sale' | 'rental' | undefined {
  const key = raw?.trim().toLowerCase()
  if (key === 'sale' || key === 'sales') return 'sale'
  if (key === 'rental' || key === 'rentals') return 'rental'
  return undefined
}

function cacheKind(kind: 'sale' | 'rental' | undefined): DealOfTheDayKind {
  return kind ?? 'all'
}

function cacheHitHeaders(): HeadersInit {
  return {
    ...listingCacheHeaders('db'),
    'X-Deal-Cache': 'hit',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  }
}

function maybeWarmPhotosInBackground(payload: DealPickPayload | DealOfTheDayResponse): void {
  void (async () => {
    if (await dealPickPhotosReady(payload)) return
    await ensureDealPickPhotos(payload)
  })().catch((err) => {
    console.warn('[/api/deal-of-the-day] background photo warm failed', err)
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cityParam = searchParams.get('city')
  const kind = resolveKindParam(searchParams.get('kind'))
  const listingId = searchParams.get('listing')?.trim() || null
  const bundle = searchParams.get('bundle') === '1'
  const town = resolveTown(cityParam)
  if (cityParam?.trim() && cityParam.trim().toLowerCase() !== 'all' && !town) {
    return NextResponse.json(
      { error: `Unsupported city '${cityParam}'` },
      { status: 400 },
    )
  }

  const scope: DealOfTheDayScope = town ?? 'All'
  const kindKey = cacheKind(kind)

  // Pinned listing is a one-off view — not cached. Everything else is SQLite-first.
  if (!listingId) {
    if (bundle && !town) {
      const bundled = await readDealOfTheDayBundle(kindKey)
      if (bundled) {
        for (const deal of Object.values(bundled.deals)) {
          if (deal) maybeWarmPhotosInBackground(deal)
        }
        return NextResponse.json(bundled, { headers: cacheHitHeaders() })
      }
    }

    const cached =
      (await readDealOfTheDayCache(scope, kindKey)) ??
      (kindKey !== 'all' ? await readDealOfTheDayCache(scope, 'all') : null)
    if (cached) {
      maybeWarmPhotosInBackground(cached)
      return NextResponse.json(
        { ...cached, source: 'db', dealCache: true },
        { headers: cacheHitHeaders() },
      )
    }
  }

  const towns = town ? [town] : [...TMRE_TOWNS]

  try {
    const batches = await Promise.all(
      towns.map((city) => fetchActiveListingsForCity(city, SCORE_PEER_LIMIT)),
    )
    const source: ListingsSource =
      batches.some((b) => b.source === 'rets') ? 'rets' : 'db'

    const seen = new Set<string>()
    let listings = filterListingsToTmreTowns(
      batches.flatMap((b) => b.listings).filter((l) => {
        const key = l.listingKey || l.mlsId
        if (!key || seen.has(key)) return false
        seen.add(key)
        return listingInTmreCoverage(l.address.postalCode, l.address.city)
      }),
    )

    if (town) {
      listings = listings.filter(
        (l) =>
          normalizeTownName(l.address.city)?.toLowerCase() === town.toLowerCase(),
      )
    }

    const peerListings = town
      ? (batches[0]?.listings ?? [])
      : batches.flatMap((b) => b.listings)

    const payload = await computeDealOfTheDay(listings, {
      peerListings,
      ...(kind ? { kind } : {}),
      ...(listingId ? { listingId } : {}),
    })
    if (!payload) {
      return NextResponse.json(
        {
          error: kind
            ? `No active ${kind === 'sale' ? 'sales' : 'rentals'} found`
            : 'No active listings found',
          totalReviewed: listings.length,
          towns: town ? [town] : [...TMRE_TOWNS],
          city: town,
          kind,
        },
        { status: 404 },
      )
    }

    const response = {
      ...buildDealOfTheDayResponse(payload, town, kind),
      source,
    }

    if (source === 'db' && !listingId) {
      await writeDealOfTheDayCache(scope, response as DealOfTheDayResponse, kindKey)
    }

    maybeWarmPhotosInBackground(response)

    return NextResponse.json(response, { headers: listingCacheHeaders(source) })
  } catch (err) {
    console.error('[/api/deal-of-the-day] error', err)
    return NextResponse.json(
      { error: 'Failed to compute deal of the day' },
      { status: 502 },
    )
  }
}
