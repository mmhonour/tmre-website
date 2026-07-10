import { NextResponse } from 'next/server'
import { firstStoredListingPhotoIndex } from '@/lib/listings-db'
import { fetchActiveListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import { isNewConstructionListing } from '@/lib/new-construction-server'
import { type Listing } from '@/lib/rets'
import {
  listingInTmreCoverage,
  resolveListingTown,
  TMRE_TOWNS,
} from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PER_TOWN_LIMIT = 500

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function enrich(l: Listing) {
  const city = resolveListingTown(l.address.city) ?? l.address.city
  const photoId = l.listingKey?.trim() || l.mlsId
  return {
    mlsId: l.mlsId,
    listingKey: l.listingKey ?? null,
    propertyType: l.propertyType,
    style: l.style,
    address: { ...l.address, city },
    price: l.price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    dom: l.dom ?? daysBetween(l.listDate ?? l.modificationTimestamp),
    photoCount: l.photoCount,
    primaryPhotoIndex: firstStoredListingPhotoIndex(photoId),
    status: l.status,
    ownerName: l.ownerName,
  }
}

export async function GET() {
  try {
    const batches = await Promise.all(
      TMRE_TOWNS.map((city) => fetchActiveListingsForCity(city, PER_TOWN_LIMIT)),
    )
    const source = batches.some((b) => b.source === 'rets') ? 'rets' : 'db'

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
      .filter((l) => l.price != null && l.price > 0)
      .filter((l) => listingInTmreCoverage(l.address.postalCode, l.address.city))
      .filter(isNewConstructionListing)
      .map(enrich)
      .sort((a, b) => (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0))

    return NextResponse.json(
      { listings, generatedAt: new Date().toISOString(), source },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/new-construction] error', err)
    return NextResponse.json({ error: 'Failed to fetch new construction listings' }, { status: 502 })
  }
}
