import { NextRequest, NextResponse } from 'next/server'
import { listingCacheHeaders } from '@/lib/listings-store'
import { searchListingsInDbByQuery } from '@/lib/db/listings-repo'
import { filterListingsToTmreTowns, isTmreTown } from '@/lib/tmre-towns'
import { searchListings, type Listing } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
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

function dedupeListings(listings: Listing[]): Listing[] {
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const l of listings) {
    const key = l.listingKey || l.mlsId
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out
}

async function supplementFromRets(query: string, limit: number, existing: Listing[]): Promise<Listing[]> {
  if (existing.length >= limit) return existing
  try {
    const retsHits = await searchListings({
      county: 'fairfield',
      status: 'Active',
      addressContains: query,
      limit: Math.max(limit * 2, 20),
    })
    return dedupeListings([...existing, ...filterListingsToTmreTowns(retsHits)]).slice(0, limit)
  } catch (err) {
    console.warn('[/api/listings/find] RETS address supplement failed', err)
    return existing
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const city = (searchParams.get('city') ?? '').trim()
  const scope = (searchParams.get('scope') ?? 'active').trim().toLowerCase()
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
    const statusBuckets =
      scope === 'all' ? ['Active', 'Closed', 'Expired'] : ['Active']

    let listings = await searchListingsInDbByQuery(q, { limit: resultLimit, statusBuckets })
    let source: 'db' | 'rets' | 'db+rets' = listings.length > 0 ? 'db' : 'db'

    if (city) {
      const cityLower = city.toLowerCase()
      listings = listings.filter(
        (l) => l.address.city?.trim().toLowerCase() === cityLower,
      )
    }

    if (listings.length < resultLimit) {
      const before = listings.length
      listings = await supplementFromRets(q, resultLimit, listings)
      if (listings.length > before) source = listings.length > 0 && before > 0 ? 'db+rets' : 'rets'
    }

    const results = listings.slice(0, resultLimit).map(enrich)

    return NextResponse.json(
      {
        query: q.toLowerCase(),
        city: city || null,
        scope,
        count: results.length,
        listings: results,
        generatedAt: new Date().toISOString(),
        source,
      },
      { headers: listingCacheHeaders(source === 'rets' ? 'rets' : 'db') },
    )
  } catch (err) {
    console.error('[/api/listings/find] error', err)
    return NextResponse.json({ error: 'Failed to search listings' }, { status: 502 })
  }
}
