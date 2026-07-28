import { NextResponse } from 'next/server'
import { fetchListingByMlsId, listingCacheHeaders } from '@/lib/listings-store'
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
} from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Parallel RETS/DB lookups when resolving OH listing keys. */
const RESOLVE_CONCURRENCY = 12

function daysBetween(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function listingKeys(l: Listing): string[] {
  return [l.listingKey?.trim(), l.mlsId?.trim()].filter(Boolean) as string[]
}

function enrichListing(l: Listing, openHouses: OpenHouseEvent[]): OpenHouseListing {
  const city = resolveListingTown(l.address.city) ?? l.address.city
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
    primaryPhotoIndex: null,
    status: l.status,
    ownerName: l.ownerName,
    openHouses: sorted,
    nextOpenHouse: sorted[0],
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  const n = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

/**
 * Resolve Property rows for OpenHouse events by OHListingId / OHListingKey.
 * Previously we sampled 500 actives/town and hoped the OH listing was in that
 * set — most events never joined.
 */
async function resolveListingsForEvents(
  events: OpenHouseEvent[],
): Promise<{ listings: Listing[]; source: 'db' | 'rets' | 'mixed' }> {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const event of events) {
    for (const id of [event.listingId, event.listingKey]) {
      const trimmed = id?.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      ids.push(trimmed)
    }
  }

  let usedDb = false
  let usedRets = false
  const resolved = await mapPool(ids, RESOLVE_CONCURRENCY, async (id) => {
    const { listing, source } = await fetchListingByMlsId(id)
    if (listing) {
      if (source === 'db') usedDb = true
      else usedRets = true
    }
    return listing
  })

  const byKey = new Map<string, Listing>()
  for (const listing of resolved) {
    if (!listing) continue
    for (const k of listingKeys(listing)) byKey.set(k, listing)
  }

  const source: 'db' | 'rets' | 'mixed' =
    usedDb && usedRets ? 'mixed' : usedRets ? 'rets' : 'db'
  return { listings: [...byKey.values()], source }
}

export async function GET() {
  try {
    const window = openHouseDateWindow()
    const openHouses = await fetchUpcomingOpenHouses(window)
    const { listings: resolved, source } =
      await resolveListingsForEvents(openHouses)

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

    const listings = resolved
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
        return (a.nextOpenHouse.startDateTime ?? '').localeCompare(
          b.nextOpenHouse.startDateTime ?? '',
        )
      })

    return NextResponse.json(
      {
        listings,
        generatedAt: new Date().toISOString(),
        source,
        window,
        windowLabel: `${window.start} through ${window.end} (ET)`,
        /** Diagnostics — raw OH events vs listings that survived join + filters. */
        eventsFound: openHouses.length,
        listingsMatched: listings.length,
      },
      { headers: listingCacheHeaders(source === 'mixed' ? 'rets' : source) },
    )
  } catch (err) {
    console.error('[/api/listings/open-houses] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch open house listings' },
      { status: 502 },
    )
  }
}
