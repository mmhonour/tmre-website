import { NextResponse } from 'next/server'
import { searchListings, type Listing } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CITIES = ['Norwalk', 'Westport', 'Wilton', 'Fairfield'] as const
const MIN_YEAR = new Date().getFullYear() - 4

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function enrich(l: Listing) {
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
    ownerName: l.ownerName,
  }
}

export async function GET() {
  try {
    const results = await Promise.all(
      CITIES.map((city) =>
        searchListings({ city, status: 'Active', limit: 200 }).catch(() => [] as Listing[]),
      ),
    )

    const listings = results
      .flat()
      .filter((l) => l.yearBuilt != null && l.yearBuilt >= MIN_YEAR && l.price != null && l.price > 0)
      .map(enrich)
      .sort((a, b) => (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0))

    return NextResponse.json({ listings, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[/api/listings/new-construction] error', err)
    return NextResponse.json({ error: 'Failed to fetch new construction listings' }, { status: 502 })
  }
}
