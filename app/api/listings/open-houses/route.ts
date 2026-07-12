import { NextResponse } from 'next/server'
import { firstStoredListingPhotoIndex } from '@/lib/listing-photos-db'
import { fetchActiveListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import {
  openHouseDateWindow,
  type OpenHouseEvent,
  type OpenHouseListing,
} from '@/lib/open-houses'
import { fetchUpcomingOpenHouses } from '@/lib/open-houses-server'
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

function listingKeys(l: Listing): string[] {
  const keys = [l.listingKey?.trim(), l.mlsId?.trim()].filter(Boolean) as string[]
  return keys
}

function enrichListing(l: Listing, openHouses: OpenHouseEvent[]): OpenHouseListing {
  const city = resolveListingTown(l.address.city) ?? l.address.city
  const photoId = l.listingKey?.trim() || l.mlsId
  const sorted = [...openHouses].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.startDateTime ?? '').localeCompare(b.startDateTime ?? '')
  })

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
    openHouses: sorted,
    nextOpenHouse: sorted[0],
  }
}

export async function GET() {
  try {
    const window = openHouseDateWindow()
    const [openHouses, batches] = await Promise.all([
      fetchUpcomingOpenHouses(window),
      Promise.all(TMRE_TOWNS.map((city) => fetchActiveListingsForCity(city, PER_TOWN_LIMIT))),
    ])

    const source = batches.some((b) => b.source === 'rets') ? 'rets' : 'db'

    const eventsByListingKey = new Map<string, OpenHouseEvent[]>()
    const eventsByMlsId = new Map<string, OpenHouseEvent[]>()
    for (const event of openHouses) {
      if (event.listingKey) {
        const list = eventsByListingKey.get(event.listingKey) ?? []
        list.push(event)
        eventsByListingKey.set(event.listingKey, list)
      }
      if (event.listingId) {
        const list = eventsByMlsId.get(event.listingId) ?? []
        list.push(event)
        eventsByMlsId.set(event.listingId, list)
      }
    }

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
      .map((l) => {
        const keys = listingKeys(l)
        const matched = new Map<string, OpenHouseEvent>()
        for (const k of keys) {
          for (const e of eventsByListingKey.get(k) ?? []) matched.set(e.id, e)
          for (const e of eventsByMlsId.get(k) ?? []) matched.set(e.id, e)
        }
        return { listing: l, events: [...matched.values()] }
      })
      .filter(({ events }) => events.length > 0)
      .map(({ listing, events }) => enrichListing(listing, events))
      .sort((a, b) => {
        const dateCmp = a.nextOpenHouse.date.localeCompare(b.nextOpenHouse.date)
        if (dateCmp !== 0) return dateCmp
        return (a.nextOpenHouse.startDateTime ?? '').localeCompare(b.nextOpenHouse.startDateTime ?? '')
      })

    return NextResponse.json(
      {
        listings,
        generatedAt: new Date().toISOString(),
        source,
        window,
        windowLabel: `${window.start} through ${window.end} (ET)`,
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/open-houses] error', err)
    return NextResponse.json({ error: 'Failed to fetch open house listings' }, { status: 502 })
  }
}
