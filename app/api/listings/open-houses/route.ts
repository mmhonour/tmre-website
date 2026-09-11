import { NextResponse } from 'next/server'
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
} from '@/lib/open-houses'
import { type Listing } from '@/lib/rets'
import { listingInTmreCoverage, resolveListingTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Forward-looking open houses: today through Sunday (ET), joined to Active
 * listings. History is not the page dataset — it is pastCount on homes that
 * still have a date today or later (Most / First / a later relist).
 *
 * Homes whose last open house was yesterday or earlier are out of scope.
 */

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

function sortEvents(events: OpenHouseEvent[]): OpenHouseEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.startDateTime ?? '').localeCompare(b.startDateTime ?? '')
  })
}

export async function GET() {
  const window = openHouseRemainingWeekWindow()
  try {
    await ensureOpenHousesTable()

    const rows = await readOpenHousesJoinedToActiveListings(window.start, window.end)

    // One listing can hold several remaining slots this week.
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

    const syncedAt = await getSyncMetaFresh(OPEN_HOUSES_SYNCED_AT_KEY).catch(
      () => null,
    )

    return NextResponse.json(
      {
        listings,
        generatedAt: new Date().toISOString(),
        source: 'db',
        syncedAt,
        window,
        windowLabel: openHouseRemainingWeekLabel(window),
        eventsFound: rows.length,
        listingsMatched: listings.length,
      },
      {
        headers: {
          'cache-control': 'public, max-age=60, stale-while-revalidate=600',
        },
      },
    )
  } catch (err) {
    console.error('[/api/listings/open-houses] error', err)
    return NextResponse.json(
      {
        error: 'Failed to read open houses',
        detail: err instanceof Error ? err.message : String(err),
        window,
      },
      { status: 502 },
    )
  }
}
