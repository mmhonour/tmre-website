import 'server-only'

import {
  openHousesTableExists,
  readOpenHouseCountsForListings,
  readOpenHousesJoinedToActiveListings,
  type OpenHouseJoinedRow,
} from '@/lib/db/open-houses-repo'
import { OPEN_HOUSES_SYNCED_AT_KEY } from '@/lib/open-houses-sync'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import {
  etCalendarDate,
  OPEN_HOUSES_PAGE_CACHE_KEY,
  openHouseHorizonWindow,
  openHouseInventoryLabel,
  openHouseRemainingWeekWindow,
  openHousesPageCacheMatchesWindow,
  pickNextOpenHouse,
  projectOpenHousesPageToDisplayWindow,
  type OpenHouseEvent,
  type OpenHouseListing,
  type OpenHousesPageData,
  type OpenHousesPageLoad,
} from '@/lib/open-houses'
import { listingInTmreCoverage, resolveListingTown } from '@/lib/tmre-towns'

export type { OpenHousesPageData, OpenHousesPageLoad }

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function isoStamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const raw = String(value)
  return raw || null
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
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

function listingFromJoinedRow(row: OpenHouseJoinedRow): {
  mlsId: string
  listingKey: string | null
  propertyType: string
  style: string
  address: OpenHouseListing['address']
  price: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  dom: number | null
  photoCount: number | null
  status: string
  ownerName: string | null
  listDate: string | null
  modificationTimestamp: string | null
} | null {
  const mlsId = row.mls_id?.trim()
  if (!mlsId) return null
  const city = row.address_city?.trim() ?? ''
  const postalCode = row.postal_code?.trim() ?? ''
  if (!city && !postalCode) return null
  return {
    mlsId,
    listingKey: row.listing_listing_key?.trim() || row.listing_key?.trim() || null,
    propertyType: row.property_type?.trim() || '',
    style: row.style?.trim() || '',
    address: {
      street: row.address_street?.trim() || '',
      unit: row.address_unit?.trim() || '',
      city,
      state: row.address_state?.trim() || 'Connecticut',
      postalCode,
      full: row.address_full?.trim() || '',
    },
    price: asNumber(row.price),
    beds: asNumber(row.beds),
    baths: asNumber(row.baths),
    sqft: asNumber(row.sqft),
    yearBuilt: asNumber(row.year_built),
    dom: asNumber(row.dom),
    photoCount: asNumber(row.photo_count),
    status: row.mls_status?.trim() || '',
    ownerName: row.owner_name?.trim() || null,
    listDate: isoStamp(row.list_date),
    modificationTimestamp: isoStamp(row.modification_timestamp),
  }
}

async function readCachedOpenHousesPage(
  window: { start: string; end: string },
): Promise<OpenHousesPageData | null> {
  try {
    const row = await readStatsCacheRow(OPEN_HOUSES_PAGE_CACHE_KEY)
    if (!row?.payload) return null
    const data = JSON.parse(row.payload) as OpenHousesPageData
    if (!openHousesPageCacheMatchesWindow(data, window)) return null
    if (!Array.isArray(data.listings)) return null
    return data
  } catch {
    return null
  }
}

async function writeCachedOpenHousesPage(data: OpenHousesPageData): Promise<void> {
  await writeStatsCacheRow(OPEN_HOUSES_PAGE_CACHE_KEY, data)
}

/**
 * Cheap page-document read. Cache row only — never the live join.
 * A miss returns null so the HTML still ships and the client can fetch.
 */
export async function peekOpenHousesPageCache(): Promise<OpenHousesPageLoad | null> {
  try {
    const inventory = openHouseHorizonWindow()
    const display = openHouseRemainingWeekWindow()
    const cached = await readCachedOpenHousesPage(inventory)
    if (!cached) return null
    return {
      ok: true,
      data: projectOpenHousesPageToDisplayWindow(
        { ...cached, source: 'db' },
        display,
      ),
    }
  } catch (err) {
    console.warn('[open-houses] page cache peek failed', err)
    return null
  }
}

/**
 * t+6 inventory for the page and `/api/listings/open-houses`.
 * Prefer the precomputed cache row; assemble from Neon only on a miss.
 * Callers receive the page display window (Sunday reset / remaining week).
 */
export async function loadOpenHousesPageData(
  options: { forceRefresh?: boolean } = {},
): Promise<OpenHousesPageLoad> {
  const inventory = openHouseHorizonWindow()
  const display = openHouseRemainingWeekWindow()
  if (!options.forceRefresh) {
    const cached = await readCachedOpenHousesPage(inventory)
    if (cached) {
      return {
        ok: true,
        data: projectOpenHousesPageToDisplayWindow(
          { ...cached, source: 'db' },
          display,
        ),
      }
    }
  }

  try {
    if (!(await openHousesTableExists())) {
      return {
        ok: false,
        error: 'open_houses table is not ready',
        window: display,
      }
    }
    const rows = await readOpenHousesJoinedToActiveListings(
      inventory.start,
      inventory.end,
    )

    const byMls = new Map<
      string,
      {
        listing: NonNullable<ReturnType<typeof listingFromJoinedRow>>
        events: Map<string, OpenHouseEvent>
        dom: number | null
      }
    >()
    for (const row of rows) {
      const listing = listingFromJoinedRow(row)
      if (!listing) continue
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
          asNumber(dom) ??
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

    const data: OpenHousesPageData = {
      listings,
      generatedAt: new Date().toISOString(),
      source: 'db',
      syncedAt,
      window: inventory,
      windowLabel: openHouseInventoryLabel(inventory),
      eventsFound: rows.length,
      listingsMatched: listings.length,
    }
    await writeCachedOpenHousesPage(data).catch((err) => {
      console.warn('[open-houses] week cache write failed', err)
    })
    return {
      ok: true,
      data: projectOpenHousesPageToDisplayWindow(data, display),
    }
  } catch (err) {
    console.error('[open-houses] load error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      window: display,
    }
  }
}

/** Rebuild the t+6 inventory payload after an upcoming OH write. */
export async function refreshOpenHousesPageCache(): Promise<void> {
  const result = await loadOpenHousesPageData({ forceRefresh: true })
  if (!result.ok) {
    throw new Error(result.error)
  }
}
