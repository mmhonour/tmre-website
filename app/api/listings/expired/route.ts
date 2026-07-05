import { NextResponse } from 'next/server'
import {
  expiredListingAgeDays,
  fetchExpiredListingsForCity,
  isExpiredListing,
  isExpiredListingOlderThan,
  listingCacheHeaders,
  EXPIRED_MIN_AGE_DAYS,
} from '@/lib/listings-store'
import { type Listing } from '@/lib/rets'
import {
  listingInTmreCoverage,
  resolveListingTown,
  TMRE_TOWNS,
} from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PER_TOWN_LIMIT = 500

function enrich(l: Listing) {
  const city = resolveListingTown(l.address.city) ?? l.address.city
  const expiredDays = expiredListingAgeDays(l)
  return {
    mlsId: l.mlsId,
    propertyType: l.propertyType,
    style: l.style,
    address: { ...l.address, city },
    price: l.price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    dom: l.dom,
    photoCount: l.photoCount,
    status: l.status,
    ownerName: l.ownerName,
    expiredDays,
    statusChangeTimestamp: l.statusChangeTimestamp,
  }
}

export async function GET() {
  try {
    const batches = await Promise.all(
      TMRE_TOWNS.map((city) => fetchExpiredListingsForCity(city, PER_TOWN_LIMIT)),
    )

    const seen = new Set<string>()
    const flat: Listing[] = []
    for (const batch of batches) {
      for (const l of batch.listings) {
        const key = l.listingKey || l.mlsId
        if (!key || seen.has(key)) continue
        seen.add(key)
        flat.push(l)
      }
    }

    const listings = flat
      .filter(isExpiredListing)
      .filter((l) => isExpiredListingOlderThan(l, EXPIRED_MIN_AGE_DAYS))
      .filter((l) => listingInTmreCoverage(l.address.postalCode, l.address.city))
      .map(enrich)
      .sort((a, b) => (b.expiredDays ?? 0) - (a.expiredDays ?? 0))

    const source = batches.some((b) => b.source === 'rets') ? 'rets' : 'db'

    return NextResponse.json(
      {
        listings,
        generatedAt: new Date().toISOString(),
        source,
        minAgeDays: EXPIRED_MIN_AGE_DAYS,
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/expired] error', err)
    return NextResponse.json({ error: 'Failed to fetch expired listings' }, { status: 502 })
  }
}
