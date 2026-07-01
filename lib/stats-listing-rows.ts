import { closeFieldsFromListing } from '@/lib/listing-history'
import type { ListingKind } from '@/lib/listing-kind'
import type { Listing } from '@/lib/rets'
import { isTmreTown } from '@/lib/tmre-towns'

export type StatsListingRow = {
  mlsId: string
  listingKey: string | null
  town: string
  address: string
  /** Last list price from MLS. */
  price: number | null
  /** Closed/sold price when available. */
  closedPrice: number | null
  listDate: string | null
  dom: number | null
  sqft: number | null
  beds: number | null
  baths: number | null
}

export const STATS_CLOSED_PERIOD_START = 2024

export function inStatsClosedPeriod(iso: string | null): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  const year = new Date(t).getFullYear()
  return year >= STATS_CLOSED_PERIOD_START && year <= new Date().getFullYear()
}

export function closedListingTimestamp(l: Listing): string | null {
  const { closeDate } = closeFieldsFromListing(l)
  return closeDate ?? l.statusChangeTimestamp ?? l.modificationTimestamp ?? null
}

function rowDate(l: Listing, kind: ListingKind): string | null {
  const { closeDate } = closeFieldsFromListing(l)
  if (closeDate) return closeDate
  if (kind === 'rental') {
    return l.listDate || l.statusChangeTimestamp || closedListingTimestamp(l)
  }
  return closedListingTimestamp(l)
}

function rowListPrice(l: Listing): number | null {
  return l.price != null && l.price > 0 ? l.price : null
}

function rowClosedPrice(l: Listing): number | null {
  const { closePrice } = closeFieldsFromListing(l)
  return closePrice != null && closePrice > 0 ? closePrice : null
}

function rowPrice(l: Listing, _kind: ListingKind): number | null {
  return rowClosedPrice(l) ?? rowListPrice(l)
}

export function closedSalePrice(l: Listing): number | null {
  const { closePrice } = closeFieldsFromListing(l)
  const price = closePrice ?? l.price
  return price != null && price > 0 ? price : null
}

export function resolveListingTown(l: Listing, fallbackTown?: string): string {
  const city = l.address.city?.trim()
  if (city && isTmreTown(city)) return city
  if (fallbackTown) return fallbackTown
  return city || '—'
}

export function listingToStatsRow(
  l: Listing,
  town: string,
  kind: ListingKind,
): StatsListingRow | null {
  const listPrice = rowListPrice(l)
  const closedPrice = rowClosedPrice(l)
  if (listPrice == null && closedPrice == null) return null
  return {
    mlsId: l.mlsId,
    listingKey: l.listingKey || null,
    town,
    address: l.address.street?.trim() || l.address.full?.trim() || '—',
    price: listPrice,
    closedPrice,
    listDate: rowDate(l, kind),
    dom: l.dom,
    sqft: l.sqft,
    beds: l.beds,
    baths: l.baths,
  }
}
