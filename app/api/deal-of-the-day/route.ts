import { NextRequest, NextResponse } from 'next/server'
import {
  fetchActiveListingsForCity,
  fetchListingByMlsId,
  isStrictlyActiveListing,
  listingCacheHeaders,
  type ListingsSource,
} from '@/lib/listings-store'
import { computeDealOfTheDay, type DealPickPayload } from '@/lib/deal-pick'
import { SCORE_PEER_LIMIT } from '@/lib/goldilocks'
import {
  buildDealOfTheDayResponse,
  DEAL_OF_THE_DAY_PROPERTY_CLASSES,
  readDealOfTheDayBundle,
  readDealOfTheDayCache,
  writeDealOfTheDayCache,
  type DealOfTheDayBundleResponse,
  type DealOfTheDayKind,
  type DealOfTheDayPropertyClass,
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

function resolveKindParam(raw: string | null): DealOfTheDayKind {
  const key = raw?.trim().toLowerCase()
  if (key === 'rental' || key === 'rentals') return 'rental'
  return 'sale'
}

function resolvePropertyClassParam(raw: string | null): DealOfTheDayPropertyClass {
  const key = raw?.trim().toLowerCase()
  if (key === 'all') return 'all'
  if (
    key &&
    (DEAL_OF_THE_DAY_PROPERTY_CLASSES as readonly string[]).includes(key)
  ) {
    return key as DealOfTheDayPropertyClass
  }
  return 'homes'
}

/**
 * Netlify CDN ignores query strings unless `Netlify-Vary` lists them — without
 * that, `/api/deal-of-the-day?kind=rental` reuses the sale/homes bundle and
 * Intelligence shows “No below-median rental pick…” (or hides DOTD entirely).
 * Same trap as Spotlight — see `spotlightApiCacheHeaders`.
 */
function dealOfTheDayCacheHeaders(hit: boolean): HeadersInit {
  return {
    ...listingCacheHeaders('db'),
    'X-Deal-Cache': hit ? 'hit' : 'miss',
    // Prefer private so a stale CDN entry cannot outlive this deploy; SQLite
    // already caches picks. Vary so any future public caching is query-safe.
    'Cache-Control': 'private, no-store',
    'Netlify-Vary': 'query=city|kind|property|propertyClass|bundle|listing',
  }
}

function cachePayloadMatchesRequest(
  body: {
    kind?: string
    propertyClass?: string
    scope?: { propertyClass?: string }
  },
  kind: DealOfTheDayKind,
  propertyClass: DealOfTheDayPropertyClass,
): boolean {
  if (body.kind != null && body.kind !== kind) return false
  const bodyClass = body.propertyClass ?? body.scope?.propertyClass
  if (bodyClass == null) return true
  if (propertyClass === 'all') return true
  return bodyClass === propertyClass || bodyClass === 'all'
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
  const propertyClass = resolvePropertyClassParam(
    searchParams.get('property') ?? searchParams.get('propertyClass'),
  )
  const listingId = searchParams.get('listing')?.trim() || null
  const bundle = searchParams.get('bundle') === '1'
  const town = resolveTown(cityParam)
  if (cityParam?.trim() && cityParam.trim().toLowerCase() !== 'all' && !town) {
    return NextResponse.json(
      { error: `Unsupported city '${cityParam}'` },
      { status: 400 },
    )
  }

  // Pinned listing is a one-off view — not cached. Everything else is SQLite-first.
  if (!listingId) {
    if (bundle && !town) {
      const bundled = await readDealOfTheDayBundle(kind, propertyClass)
      if (bundled && cachePayloadMatchesRequest(bundled, kind, propertyClass)) {
        for (const deal of Object.values(bundled.deals)) {
          if (deal) maybeWarmPhotosInBackground(deal)
        }
        return NextResponse.json(bundled, {
          headers: dealOfTheDayCacheHeaders(true),
        })
      }
      // Home / carousel expect `{ deals }` — never fall through to a single-payload
      // live pick (wrong shape + multi-town recompute that leaves the hero blank).
      return NextResponse.json(
        {
          generatedAt: new Date().toISOString(),
          kind,
          propertyClass,
          deals: {},
          source: 'db',
          dealCache: true,
        } satisfies DealOfTheDayBundleResponse,
        { headers: dealOfTheDayCacheHeaders(false) },
      )
    }

    if (town) {
      const cached = await readDealOfTheDayCache(town, kind, propertyClass)
      if (cached && cachePayloadMatchesRequest(cached, kind, propertyClass)) {
        maybeWarmPhotosInBackground(cached)
        return NextResponse.json(
          { ...cached, source: 'db', dealCache: true },
          { headers: dealOfTheDayCacheHeaders(true) },
        )
      }
    } else {
      // No city → prefer bundle composition; if missing, fall through to live pick
      // for a single synthetic "first town" isn't useful — recompute below across towns.
      const bundled = await readDealOfTheDayBundle(kind, propertyClass)
      if (bundled && cachePayloadMatchesRequest(bundled, kind, propertyClass)) {
        // Return first available deal as a single-payload convenience, matching prior "All" shape.
        const firstTown = TMRE_TOWNS.find((t) => bundled.deals[t])
        const first = firstTown ? bundled.deals[firstTown] : null
        if (
          first &&
          cachePayloadMatchesRequest(first, kind, propertyClass)
        ) {
          maybeWarmPhotosInBackground(first)
          return NextResponse.json(
            { ...first, source: 'db', dealCache: true },
            { headers: dealOfTheDayCacheHeaders(true) },
          )
        }
      }
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

    // Pinned deep links often target a listing outside the peer-cap window —
    // resolve it explicitly so Intelligence → DOTD doesn't 404.
    if (listingId) {
      const already = listings.some(
        (l) =>
          l.mlsId?.trim().toLowerCase() === listingId.toLowerCase() ||
          l.listingKey?.trim().toLowerCase() === listingId.toLowerCase(),
      )
      if (!already) {
        const { listing: pinned } = await fetchListingByMlsId(listingId)
        if (pinned) {
          listings = [pinned, ...listings]
        }
      }
    }

    const peerListings = town
      ? (batches[0]?.listings ?? [])
      : batches.flatMap((b) => b.listings)

    const payload = await computeDealOfTheDay(listings, {
      peerListings,
      kind,
      // Pinned listing views ignore subtype so a homes deep-link still works
      // even if the client cookie said Multi/Condos.
      ...(listingId || propertyClass === 'all' ? {} : { propertyClass }),
      ...(listingId ? { listingId } : {}),
    })
    if (!payload || !isStrictlyActiveListing(payload.listing)) {
      return NextResponse.json(
        {
          error: `No active ${kind === 'sale' ? 'sales' : 'rentals'} (${propertyClass}) found`,
          totalReviewed: listings.length,
          towns: town ? [town] : [...TMRE_TOWNS],
          city: town,
          kind,
          propertyClass,
        },
        { status: 404 },
      )
    }

    const response = {
      ...buildDealOfTheDayResponse(payload, town, kind, propertyClass),
      source,
    }

    if (source === 'db' && !listingId && town) {
      await writeDealOfTheDayCache(
        town as DealOfTheDayScope,
        response as DealOfTheDayResponse,
        kind,
        propertyClass,
      )
    }

    maybeWarmPhotosInBackground(response)

    return NextResponse.json(response, {
      headers: {
        ...dealOfTheDayCacheHeaders(false),
        'X-Listings-Source': source,
      },
    })
  } catch (err) {
    console.error('[/api/deal-of-the-day] error', err)
    return NextResponse.json(
      { error: 'Failed to compute deal of the day' },
      { status: 502 },
    )
  }
}
