import 'server-only'

import {
  ensureOpenHousesTable,
  readOpenHouseCountsForListings,
  readOpenHousesJoinedToActiveListings,
} from '@/lib/db/open-houses-repo'
import { OPEN_HOUSES_SYNCED_AT_KEY } from '@/lib/open-houses-sync'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  etCalendarDate,
  openHouseRemainingWeekLabel,
  openHouseRemainingWeekWindow,
  pickNextOpenHouse,
  type OpenHouseEvent,
  type OpenHouseListing,
  type OpenHousesPageData,
  type OpenHousesPageLoad,
} from '@/lib/open-houses'
import { type Listing } from '@/lib/rets'
import { openHouseListingTown } from '@/lib/open-houses-groups'
import { listingInTmreCoverage, resolveListingTown } from '@/lib/tmre-towns'

export type { OpenHousesPageData, OpenHousesPageLoad }

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function daysBetween(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

/** Temporary test cap so /open-houses can load: first home in each town. */
function takeFirstListingPerTown(listings: OpenHouseListing[]): OpenHouseListing[] {
  const seen = new Set<string>()
  const out: OpenHouseListing[] = []
  for (const listing of listings) {
    const town = openHouseListingTown(listing)
    if (seen.has(town)) continue
    seen.add(town)
    out.push(listing)
  }
  return out
}

function sortEvents(events: OpenHouseEvent[]): OpenHouseEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.startDateTime ?? '').localeCompare(b.startDateTime ?? '')
  })
}

/**
 * Remaining-week open houses for the page and `/api/listings/open-houses`.
 * Same payload both places so the HTML is not an empty “Loading…” shell.
 */
export async function loadOpenHousesPageData(): Promise<OpenHousesPageLoad> {
  const window = openHouseRemainingWeekWindow()
  try {
    await ensureOpenHousesTable()
    const rows = await readOpenHousesJoinedToActiveListings(window.start, window.end)

    const byMls = new Map<
      string,
      { listing: Listing; events: Map<string, OpenHouseEvent>; dom: number | null }
    >()
    for (const row of rows) {
      const listing = row.listing_json as Listing | null
      if (!listing?.address) continue
      if (!listingInTmreCoverage(listing.address.postalCode, listing.address.city)) {
        continue
      }
      const entry =
        byMls.get(row.mls_id) ?? { listing, events: new Map(), dom: row.dom }
      entry.events.set(row.oh_id, {
        id: row.oh_id,
        listingKey: row.listing_key ?? '',
        listingId: row.listing_id ?? '',
        date: isoDate(row.oh_date),
        startDateTime: row.start_datetime,
        endDateTime: row.end_datetime,
        type: row.oh_type ?? '',
        comment: row.comment,
      })
      byMls.set(row.mls_id, entry)
    }

    const today = etCalendarDate()
    const countByToken = await readOpenHouseCountsForListings(
      [...byMls.values()].map(({ listing }) => ({
        mlsId: listing.mlsId,
        listingKey: listing.listingKey,
      })),
      today,
    )

    const listings: OpenHouseListing[] = []
    for (const { listing, events, dom } of byMls.values()) {
      const sorted = sortEvents([...events.values()])
      const next = pickNextOpenHouse(sorted, today)
      if (!next) continue
      const city =
        resolveListingTown(listing.address.city) ?? listing.address.city
      const counts =
        countByToken.get(listing.mlsId.trim()) ??
        (listing.listingKey
          ? countByToken.get(listing.listingKey.trim())
          : undefined) ??
        { past: 0, upcoming: sorted.length }
      listings.push({
        mlsId: listing.mlsId,
        listingKey: listing.listingKey ?? null,
        propertyType: listing.propertyType,
        style: listing.style,
        address: { ...listing.address, city },
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        sqft: listing.sqft,
        yearBuilt: listing.yearBuilt,
        dom:
          listing.dom ??
          dom ??
          daysBetween(listing.listDate ?? listing.modificationTimestamp),
        photoCount: listing.photoCount,
        primaryPhotoIndex: null,
        status: listing.status,
        ownerName: listing.ownerName,
        openHouses: sorted,
        nextOpenHouse: next,
        pastCount: counts.past,
        upcomingCount: Math.max(counts.upcoming, sorted.length),
        weekOpenHouseCount: sorted.length,
      })
    }

    listings.sort((a, b) => {
      const dateCmp = a.nextOpenHouse.date.localeCompare(b.nextOpenHouse.date)
      if (dateCmp !== 0) return dateCmp
      return (a.nextOpenHouse.startDateTime ?? '').localeCompare(
        b.nextOpenHouse.startDateTime ?? '',
      )
    })
    const capped = takeFirstListingPerTown(listings)

    const syncedAt = await getSyncMetaFresh(OPEN_HOUSES_SYNCED_AT_KEY).catch(
      () => null,
    )

    return {
      ok: true,
      data: {
        listings: capped,
        generatedAt: new Date().toISOString(),
        source: 'db',
        syncedAt,
        window,
        windowLabel: openHouseRemainingWeekLabel(window),
        eventsFound: rows.length,
        listingsMatched: capped.length,
      },
    }
  } catch (err) {
    console.error('[open-houses] load error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      window,
    }
  }
}
