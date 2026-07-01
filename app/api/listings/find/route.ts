import { NextRequest, NextResponse } from 'next/server'
import { fetchActiveListingsAcrossTowns, listingCacheHeaders } from '@/lib/listings-store'
import { TMRE_MARKET_TOWNS, type Listing } from '@/lib/rets'
import { filterListingsToTmreTowns, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function matchesQuery(l: Listing, q: string): boolean {
  const hay = [
    l.mlsId,
    l.address.full,
    l.address.street,
    l.address.city,
    l.address.postalCode,
    l.propertyType,
    l.style,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function enrich(l: Listing) {
  const pricePerSqft = l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null
  return {
    mlsId: l.mlsId,
    propertyType: l.propertyType,
    style: l.style,
    address: l.address,
    price: l.price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    dom: l.dom ?? daysBetween(l.listDate ?? l.modificationTimestamp),
    photoCount: l.photoCount,
    status: l.status,
    pricePerSqft,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  const city = (searchParams.get('city') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '100')
  const resultLimit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
    : 100

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: 'q is required (min 2 characters)' },
      { status: 400 },
    )
  }

  if (city && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  try {
    const towns = city ? [city] : [...TMRE_MARKET_TOWNS]
    const { listings, source } = await fetchActiveListingsAcrossTowns(towns, {
      limit: 500,
    })
    const results = filterListingsToTmreTowns(listings)
      .filter((l) => matchesQuery(l, q))
      .map(enrich)

    return NextResponse.json(
      {
        query: q,
        city: city || null,
        count: results.length,
        listings: results.slice(0, resultLimit),
        generatedAt: new Date().toISOString(),
        source,
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/find] error', err)
    return NextResponse.json({ error: 'Failed to search listings' }, { status: 502 })
  }
}
