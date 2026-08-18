import 'server-only'

import { closeFieldsFromListing } from '@/lib/listing-history'
import { coerceLotAcres, parseLotAcresFromRaw } from '@/lib/listing-lot-acres'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import type { LatestListingRow } from '@/lib/latest-listings'
import { latestRowActivityMs } from '@/lib/latest-activity'
import {
  readRecentlyClosedListings,
  type RecentlyUpdatedRow,
} from '@/lib/db/listings-repo'
import type { Listing } from '@/lib/rets'
import {
  isTmreTown,
  listingInTmreCoverage,
  normalizeZip,
  resolveListingTown,
} from '@/lib/tmre-towns'
import { CLOSED_FEED_LIMIT } from '@/lib/closed-shared'

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType)
}

function shortType(propertyType: string): string {
  const t = propertyType.replace(/ For Sale$/i, '').replace(/ For Lease$/i, ' (Lease)')
  if (/single family/i.test(t)) return 'SFR'
  if (/condo|co-op/i.test(t)) return 'Condo'
  if (/multi/i.test(t)) return 'Multi'
  if (/lots|land/i.test(t)) return 'Land'
  if (/rental/i.test(t)) return 'Rental'
  return t
}

function parseStoredBreakdown(json: string | null | undefined): ScoreBreakdown | null {
  if (!json?.trim()) return null
  try {
    const parsed = JSON.parse(json) as ScoreBreakdown
    if (typeof parsed?.composite !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function toClosedRow(
  listing: Listing,
  score: ScoreBreakdown | null,
  syncedAt: string,
  dbTown: string,
  storedScore: number | null,
): LatestListingRow | null {
  const { closeDate, closePrice } = closeFieldsFromListing(listing)
  const eventAt =
    closeDate?.trim() ||
    listing.statusChangeTimestamp?.trim() ||
    null
  if (!eventAt) return null

  const price =
    closePrice != null && closePrice > 0 ? closePrice : listing.price
  if (price == null || price <= 0) return null

  const rental = isRentalType(listing.propertyType)
  const pricePerSqft =
    !rental && listing.sqft && listing.sqft > 0 ? price / listing.sqft : null
  const zip = normalizeZip(listing.address.postalCode)
  const town =
    (isTmreTown(dbTown) ? dbTown.trim() : null) ||
    resolveListingTown(listing.address.city)
  if (!town || !isTmreTown(town)) return null
  if (!listingInTmreCoverage(zip, town)) return null

  const composite =
    score?.composite ??
    (storedScore != null && Number.isFinite(Number(storedScore))
      ? Number(storedScore)
      : 0)

  return {
    key: listing.listingKey || listing.mlsId,
    listingKey: listing.listingKey ?? null,
    mlsId: listing.mlsId,
    score: composite,
    scoreBreakdown: score,
    address: listing.address.street || listing.address.full,
    city: listing.address.city?.trim() || null,
    town,
    zip,
    type: shortType(listing.propertyType),
    price,
    priceChange: null,
    pricePerSqft,
    sqft: listing.sqft,
    lotAcres:
      coerceLotAcres(listing.lotAcres) ?? parseLotAcresFromRaw(listing.raw) ?? null,
    dom: listing.dom ?? null,
    status: 'New',
    isRental: rental,
    beds: listing.beds,
    baths: listing.baths,
    yearBuilt: listing.yearBuilt,
    headline: listing.remarks?.trim().slice(0, 80) ?? '',
    photoCount: listing.photoCount ?? null,
    primaryPhotoIndex: null,
    modificationTimestamp: listing.modificationTimestamp ?? null,
    listDate: listing.listDate?.trim() || null,
    eventAt,
    syncedAt,
  }
}

function mapClosedRows(rows: RecentlyUpdatedRow[]): LatestListingRow[] {
  const out: LatestListingRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const stored = parseStoredBreakdown(row.goldilocksBreakdown)
    const mapped = toClosedRow(
      row.listing,
      stored,
      row.syncedAt,
      row.town,
      row.goldilocksScore,
    )
    if (!mapped || seen.has(mapped.key)) continue
    seen.add(mapped.key)
    out.push(mapped)
  }
  return out.sort((a, b) => latestRowActivityMs(b) - latestRowActivityMs(a))
}

export async function fetchClosedListings(options: {
  fromDay: string
  toDay: string
  limit?: number
  town?: string | null
}): Promise<LatestListingRow[]> {
  const cap = options.limit ?? CLOSED_FEED_LIMIT
  const rows = await readRecentlyClosedListings({
    fromDay: options.fromDay,
    toDay: options.toDay,
    limit: Math.min(Math.max(cap * 2, cap), 400),
    town: options.town,
  })
  return mapClosedRows(rows).slice(0, cap)
}
