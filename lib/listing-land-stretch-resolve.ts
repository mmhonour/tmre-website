import 'server-only'

import {
  closedSaleToStretchSale,
  readClosedSalesInBounds,
  readListingLandPremium,
  upsertListingLandPremium,
} from '@/lib/db/listing-land-premiums-repo'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  LAND_STRETCH_ALGO_VERSION,
  LAND_STRETCH_LENGTH_MILES,
  LAND_STRETCH_LOOKBACK_MONTHS,
  computeLandStretchInsight,
  emptyLandStretchInsight,
  type LandStretchInsight,
  type StretchSubject,
} from '@/lib/listing-land-stretch'
import type { Listing } from '@/lib/rets'
import { resolveListingTown, townForZip } from '@/lib/tmre-towns'

const LAND_STRETCH_TTL_MS = 12 * 60 * 60 * 1000
/** Fetch box is slightly larger than the stretch so we do not clip the corridor. */
const FETCH_HALF_EXTENT_MILES = LAND_STRETCH_LENGTH_MILES * 0.7
const MILES_PER_DEG_LAT = 69.172

function mediansMatch(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 0.51
}

function isFresh(iso: string | null | undefined, ttlMs: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return Date.now() - t < ttlMs
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

/**
 * Cache-first land stretch for any listing. Uses that listing's town solds
 * and amenity axes — no per-address special cases.
 */
export async function resolveLandStretchForListing(
  listing: Listing,
  cityMedianPpsf: number | null,
): Promise<LandStretchInsight> {
  const subject = subjectFromListing(listing)
  const pricePerSqft = subject?.pricePerSqft ?? listingPpsf(listing)
  if (!subject) {
    return emptyLandStretchInsight(pricePerSqft, cityMedianPpsf)
  }

  const cached = await readListingLandPremium(subject.id).catch(() => null)
  if (
    cached &&
    cached.algoVersion === LAND_STRETCH_ALGO_VERSION &&
    isFresh(cached.computedAt, LAND_STRETCH_TTL_MS) &&
    mediansMatch(cached.cityMedianPpsf, cityMedianPpsf)
  ) {
    const { listingId: _id, computedAt: _at, ...insight } = cached
    return insight
  }

  const town =
    townForZip(listing.address.postalCode) ??
    resolveListingTown(listing.address.city)
  if (!town) {
    return emptyLandStretchInsight(pricePerSqft, cityMedianPpsf)
  }

  const lookbackMs =
    LAND_STRETCH_LOOKBACK_MONTHS * 30.44 * 24 * 60 * 60 * 1000
  const closeDateFromIso = new Date(Date.now() - lookbackMs).toISOString()
  const box = boundsAround(subject.latitude, subject.longitude, FETCH_HALF_EXTENT_MILES)

  const closed = await readClosedSalesInBounds({
    town,
    ...box,
    closeDateFromIso,
  })
  const sales = closed
    .filter((row) => row.id !== subject.id)
    .map(closedSaleToStretchSale)

  const insight = computeLandStretchInsight(subject, sales, cityMedianPpsf)
  const computedAt = new Date().toISOString()
  await upsertListingLandPremium({
    listingId: subject.id,
    insight,
    computedAt,
  }).catch((err) => {
    console.warn(
      '[land-stretch] persist failed',
      err instanceof Error ? err.message : err,
    )
  })
  return insight
}
