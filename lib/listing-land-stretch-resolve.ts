import 'server-only'

import {
  closedSaleToStretchSale,
  readClosedSalesInBounds,
  readListingLandPremium,
  upsertListingLandPremium,
  type ClosedSaleGeoRow,
} from '@/lib/db/listing-land-premiums-repo'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { closeFieldsFromListing } from '@/lib/listing-history'
import { isRentalListing } from '@/lib/listing-kind'
import {
  LAND_STRETCH_ALGO_VERSION,
  LAND_STRETCH_LENGTH_MILES,
  LAND_STRETCH_LOOKBACK_MONTHS,
  applyTownMedianToLandStretch,
  computeLandStretchInsight,
  emptyLandStretchInsight,
  type LandStretchInsight,
  type StretchSale,
  type StretchSubject,
} from '@/lib/listing-land-stretch'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { resolveListingTown, townForZip } from '@/lib/tmre-towns'

const FETCH_HALF_EXTENT_MILES = LAND_STRETCH_LENGTH_MILES * 0.7
const MILES_PER_DEG_LAT = 69.172

export function landStretchCacheKey(listingId: string): string {
  return `land:stretch:v${LAND_STRETCH_ALGO_VERSION}:${listingId}`
}

function listingPpsf(listing: Listing): number | null {
  const price = listing.price != null && listing.price > 0 ? listing.price : null
  const sqft = listing.sqft != null && listing.sqft > 0 ? listing.sqft : null
  if (price == null || sqft == null) return null
  return price / sqft
}

function subjectFromListing(listing: Listing): StretchSubject | null {
  const lat = listing.latitude != null ? Number(listing.latitude) : null
  const lon = listing.longitude != null ? Number(listing.longitude) : null
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }
  const id = listingRowId(listing)
  if (!id) return null
  return {
    id,
    latitude: lat,
    longitude: lon,
    postalCode: listing.address.postalCode,
    city: listing.address.city,
    street: listing.address.street ?? listing.address.full,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft != null && listing.sqft > 0 ? listing.sqft : null,
    pricePerSqft: listingPpsf(listing),
  }
}

function boundsAround(lat: number, lon: number, halfMiles: number) {
  const dLat = halfMiles / MILES_PER_DEG_LAT
  const dLon = halfMiles / (MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lon - dLon,
    maxLon: lon + dLon,
  }
}

export function listingToStretchSale(listing: Listing): StretchSale | null {
  if (isRentalListing(listing)) return null
  if (!isClosedListing(listing)) return null
  const id = listingRowId(listing)
  const lat = listing.latitude != null ? Number(listing.latitude) : null
  const lon = listing.longitude != null ? Number(listing.longitude) : null
  const price = closedSalePrice(listing)
  const sqft = listing.sqft != null && listing.sqft > 0 ? listing.sqft : null
  if (
    !id ||
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    price == null ||
    sqft == null
  ) {
    return null
  }
  const { closeDate } = closeFieldsFromListing(listing)
  return {
    id,
    latitude: lat,
    longitude: lon,
    pricePerSqft: price / sqft,
    closeDate: closeDate ?? null,
    beds: listing.beds,
    baths: listing.baths,
    sqft,
    street: listing.address.street ?? listing.address.full,
  }
}

function insightFromCacheRow(row: {
  algoVersion: number
  axis: LandStretchInsight['axis']
  soldCount: number
  stretchMedianPpsf: number | null
  cityMedianPpsf: number | null
  listingPpsf: number | null
  stretchPremiumPct: number | null
  listingPremiumPct: number | null
  explainsLandPremium: boolean
  labels: string[]
  candidates: LandStretchInsight['candidates']
}): LandStretchInsight | null {
  if (row.algoVersion !== LAND_STRETCH_ALGO_VERSION) return null
  return {
    algoVersion: row.algoVersion,
    axis: row.axis,
    soldCount: row.soldCount,
    stretchMedianPpsf: row.stretchMedianPpsf,
    cityMedianPpsf: row.cityMedianPpsf,
    listingPpsf: row.listingPpsf,
    stretchPremiumPct: row.stretchPremiumPct,
    listingPremiumPct: row.listingPremiumPct,
    explainsLandPremium: row.explainsLandPremium,
    labels: row.labels,
    candidates: row.candidates,
  }
}

/**
 * Read-only. Listing / Insight pages never query solds or write.
 * Town-median comparison is applied here from the already-scored listing.
 */
export async function readLandStretchForListing(
  listing: Listing,
  cityMedianPpsf: number | null,
): Promise<LandStretchInsight> {
  const pricePerSqft = listingPpsf(listing)
  const id = listingRowId(listing)
  if (!id) return emptyLandStretchInsight(pricePerSqft, cityMedianPpsf)

  const table = await readListingLandPremium(id).catch(() => null)
  const fromTable = table ? insightFromCacheRow(table) : null
  if (fromTable) {
    return applyTownMedianToLandStretch(fromTable, cityMedianPpsf, pricePerSqft)
  }

  try {
    const row = await readStatsCacheRow(landStretchCacheKey(id))
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as LandStretchInsight
      const fromCache = insightFromCacheRow(parsed)
      if (fromCache) {
        return applyTownMedianToLandStretch(fromCache, cityMedianPpsf, pricePerSqft)
      }
    }
  } catch {
    // fall through to empty
  }

  return emptyLandStretchInsight(pricePerSqft, cityMedianPpsf)
}

async function persistLandStretch(
  listingId: string,
  insight: LandStretchInsight,
): Promise<void> {
  const computedAt = new Date().toISOString()
  await upsertListingLandPremium({ listingId, insight, computedAt })
  await writeStatsCacheRow(landStretchCacheKey(listingId), insight).catch(
    () => undefined,
  )
}

async function salesFromBounds(subject: StretchSubject, listing: Listing): Promise<StretchSale[]> {
  const town =
    townForZip(listing.address.postalCode) ??
    resolveListingTown(listing.address.city)
  if (!town) return []
  const lookbackMs =
    LAND_STRETCH_LOOKBACK_MONTHS * 30.44 * 24 * 60 * 60 * 1000
  const box = boundsAround(subject.latitude, subject.longitude, FETCH_HALF_EXTENT_MILES)
  const closed: ClosedSaleGeoRow[] = await readClosedSalesInBounds({
    town,
    ...box,
    closeDateFromIso: new Date(Date.now() - lookbackMs).toISOString(),
  })
  return closed.filter((row) => row.id !== subject.id).map(closedSaleToStretchSale)
}

/**
 * Write path — same lane as What-if estimates. Prefer the town Closed pool
 * already loaded for If; fall back to a boxed closed-sale read.
 */
export async function cacheLandStretchForListing(
  listing: Listing,
  soldPool?: readonly Listing[],
): Promise<LandStretchInsight> {
  const subject = subjectFromListing(listing)
  const pricePerSqft = subject?.pricePerSqft ?? listingPpsf(listing)
  if (!subject) return emptyLandStretchInsight(pricePerSqft, null)

  const fromPool = (soldPool ?? [])
    .map(listingToStretchSale)
    .filter((sale): sale is StretchSale => sale != null && sale.id !== subject.id)
  const sales =
    fromPool.length > 0 ? fromPool : await salesFromBounds(subject, listing)

  const insight = computeLandStretchInsight(subject, sales, null)
  await persistLandStretch(subject.id, insight).catch((err) => {
    console.warn(
      '[land-stretch] persist failed',
      err instanceof Error ? err.message : err,
    )
  })
  return insight
}

/** @deprecated Use readLandStretchForListing on request paths. */
export async function resolveLandStretchForListing(
  listing: Listing,
  cityMedianPpsf: number | null,
): Promise<LandStretchInsight> {
  return readLandStretchForListing(listing, cityMedianPpsf)
}
