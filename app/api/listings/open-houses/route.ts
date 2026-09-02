import { NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { ensureOpenHousesTable } from '@/lib/db/open-houses-repo'
import { OPEN_HOUSES_SYNCED_AT_KEY } from '@/lib/open-houses-sync'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  openHouseDateWindow,
  type OpenHouseEvent,
  type OpenHouseListing,
} from '@/lib/open-houses'
import { type Listing } from '@/lib/rets'
import { listingInTmreCoverage, resolveListingTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Open houses for the rolling window, joined to listings in Postgres.
 *
 * This route used to query RETS on every request — a login, then a per-listing
 * lookup that fell back to RETS again for anything not already stored, twelve
 * at a time. In a serverless function with seconds to spend that reliably timed
 * out, which is how a shipped page ended up answering 502. The events are
 * synced into `open_houses` now and this is one query.
 *
 * The listing comes back as the `data` jsonb rather than a column list, because
 * that column *is* the serialized Listing — unit, state and owner have no
 * columns of their own, and picking columns here would silently drop them.
 */

type Row = {
  oh_id: string
  listing_key: string | null
  listing_id: string | null
  oh_date: Date | string
  start_datetime: string | null
  end_datetime: string | null
  oh_type: string | null
  comment: string | null
  mls_id: string
  listing_json: unknown
  mls_status: string | null
  dom: number | null
}

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
  const window = openHouseDateWindow()
  try {
    await ensureOpenHousesTable()

    // Inner join: an event whose listing we do not hold has nothing to show.
    // Either key matches, because SmartMLS populates OHListingId reliably and
    // OHListingKey only most of the time.
    const rows = await query<Row>(
      `SELECT oh.id         AS oh_id,
              oh.listing_key,
              oh.listing_id,
              oh.oh_date,
              oh.start_datetime,
              oh.end_datetime,
              oh.oh_type,
              oh.comment,
              l.mls_id,
              l.data        AS listing_json,
              l.mls_status,
              l.dom
         FROM open_houses oh
         JOIN listings l
           ON (oh.listing_id IS NOT NULL AND oh.listing_id = l.mls_id)
           OR (oh.listing_key IS NOT NULL AND oh.listing_key = l.listing_key)
        WHERE oh.oh_date BETWEEN $1::date AND $2::date
          AND l.status_bucket = 'Active'
          AND l.price IS NOT NULL AND l.price > 0
        ORDER BY oh.oh_date ASC, oh.start_datetime ASC NULLS LAST`,
      [window.start, window.end],
    )

    // One listing can hold several slots across the week.
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

    const listings: OpenHouseListing[] = []
    for (const { listing, events, dom } of byMls.values()) {
      const sorted = sortEvents([...events.values()])
      const next = sorted[0]
      if (!next) continue
      const city =
        resolveListingTown(listing.address.city) ?? listing.address.city
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
        windowLabel: `${window.start} through ${window.end} (ET)`,
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
