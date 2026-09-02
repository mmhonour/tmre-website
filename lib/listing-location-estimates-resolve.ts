import 'server-only'

import {
  closedSaleToEstimateSale,
  readClosedSalesInBounds,
  readLocationEstimateRow,
  upsertLocationEstimate,
  type ClosedSaleGeoRow,
} from '@/lib/db/listing-location-estimates-repo'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { closeFieldsFromListing } from '@/lib/listing-history'
import { isRentalListing } from '@/lib/listing-kind'
import {
  LOCATION_CORRIDOR_LENGTH_MILES,
  LOCATION_ESTIMATE_ALGO_VERSION,
  LOCATION_ESTIMATE_LOOKBACK_MONTHS,
  applyTownMedianToLocationEstimate,
  computeLocationEstimate,
  emptyLocationEstimate,
  type EstimateSale,
  type EstimateSubject,
  type LocationEstimate,
} from '@/lib/listing-location-estimates'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { resolveListingTown, townForZip } from '@/lib/tmre-towns'

const FETCH_HALF_EXTENT_MILES = LOCATION_CORRIDOR_LENGTH_MILES * 0.7
const MILES_PER_DEG_LAT = 69.172

export function locationEstimateCacheKey(listingId: string): string {
  return `location:estimate:v${LOCATION_ESTIMATE_ALGO_VERSION}:${listingId}`
}

function listingPpsf(listing: Listing): number | null {
  const price = listing.price != null && listing.price > 0 ? listing.price : null
  const sqft = listing.sqft != null && listing.sqft > 0 ? listing.sqft : null
  if (price == null || sqft == null) return null
  return price / sqft
}

function subjectFromListing(listing: Listing): EstimateSubject | null {
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

export function listingToEstimateSale(listing: Listing): EstimateSale | null {
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

function estimateFromCacheRow(row: LocationEstimate): LocationEstimate | null {
  if (row.algoVersion !== LOCATION_ESTIMATE_ALGO_VERSION) return null
  return {
    ...row,
    kind: row.kind ?? row.axis,
    axis: row.axis ?? row.kind,
  }
}

/**
 * Read-only. Listing / Insight pages never query solds or write.
 * Town-median comparison is applied here from the already-scored listing.
 */
export async function readLocationEstimateForListing(
  listing: Listing,
  cityMedianPpsf: number | null,
): Promise<LocationEstimate> {
  const pricePerSqft = listingPpsf(listing)
  const id = listingRowId(listing)
  if (!id) return emptyLocationEstimate(pricePerSqft, cityMedianPpsf)

  const table = await readLocationEstimateRow(id).catch(() => null)
  const fromTable = table ? estimateFromCacheRow(table) : null
  if (fromTable) {
    return applyTownMedianToLocationEstimate(fromTable, cityMedianPpsf, pricePerSqft)
  }

  try {
    const row = await readStatsCacheRow(locationEstimateCacheKey(id))
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as LocationEstimate
      const fromCache = estimateFromCacheRow(parsed)
      if (fromCache) {
        return applyTownMedianToLocationEstimate(
          fromCache,
          cityMedianPpsf,
          pricePerSqft,
        )
      }
    }
  } catch {
    // fall through to empty
  }

  return emptyLocationEstimate(pricePerSqft, cityMedianPpsf)
}

async function persistLocationEstimate(
  listingId: string,
  estimate: LocationEstimate,
): Promise<void> {
  const computedAt = new Date().toISOString()
  await upsertLocationEstimate({ listingId, estimate, computedAt })
  await writeStatsCacheRow(locationEstimateCacheKey(listingId), estimate).catch(
    () => undefined,
  )
}

async function salesFromBounds(
  subject: EstimateSubject,
  listing: Listing,
): Promise<EstimateSale[]> {
  const town =
    townForZip(listing.address.postalCode) ??
    resolveListingTown(listing.address.city)
  if (!town) return []
  const lookbackMs =
    LOCATION_ESTIMATE_LOOKBACK_MONTHS * 30.44 * 24 * 60 * 60 * 1000
  const box = boundsAround(
    subject.latitude,
    subject.longitude,
    FETCH_HALF_EXTENT_MILES,
  )
  const closed: ClosedSaleGeoRow[] = await readClosedSalesInBounds({
    town,
    ...box,
    closeDateFromIso: new Date(Date.now() - lookbackMs).toISOString(),
  })
  return closed.filter((row) => row.id !== subject.id).map(closedSaleToEstimateSale)
}

/**
 * Write path — overnight backfill and What-if estimate cache.
 * Prefer the town Closed pool already in memory.
 */
export async function cacheLocationEstimateForListing(
  listing: Listing,
  soldPool?: readonly Listing[],
): Promise<LocationEstimate> {
  const subject = subjectFromListing(listing)
  const pricePerSqft = subject?.pricePerSqft ?? listingPpsf(listing)
  if (!subject) return emptyLocationEstimate(pricePerSqft, null)

  const fromPool = (soldPool ?? [])
    .map(listingToEstimateSale)
    .filter((sale): sale is EstimateSale => sale != null && sale.id !== subject.id)
  const sales =
    fromPool.length > 0 ? fromPool : await salesFromBounds(subject, listing)

  const estimate = computeLocationEstimate(subject, sales, null)
  await persistLocationEstimate(subject.id, estimate).catch((err) => {
    console.warn(
      '[location-estimates] persist failed',
      err instanceof Error ? err.message : err,
    )
  })
  return estimate
}
