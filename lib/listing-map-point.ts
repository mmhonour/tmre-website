import 'server-only'

import { getZipBoundaryRings } from '@/lib/zip-boundary-cache'
import {
  censusGeocodeCoordinates,
  finiteLatLon,
  listingMapPointCacheKey,
  listingStreetLine,
  pointInTownRings,
  resolveListingMapPointFromParts,
  type ListingMapInput,
  type ListingMapPoint,
  type TownRing,
} from '@/lib/listing-map-point-shared'
import {
  resolveListingTownKey,
  zipsForTown,
  type TmreTown,
} from '@/lib/tmre-towns'

export type { ListingMapPoint, ListingMapPointSource } from '@/lib/listing-map-point-shared'

const CENSUS_GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/locations/address'
const GEOCODE_TIMEOUT_MS = 4_000
const POINT_CACHE_MAX = 400
const TOWN_RINGS_TTL_MS = 10 * 60 * 1000

const pointCache = new Map<string, ListingMapPoint | null>()
let townRingsMemo: { at: number; byTown: Map<TmreTown, TownRing[]> } | null = null

function cachePoint(key: string, value: ListingMapPoint | null): ListingMapPoint | null {
  if (pointCache.size >= POINT_CACHE_MAX) {
    const first = pointCache.keys().next().value
    if (first !== undefined) pointCache.delete(first)
  }
  pointCache.set(key, value)
  return value
}

async function townRingsFor(town: TmreTown): Promise<TownRing[]> {
  const now = Date.now()
  if (townRingsMemo && now - townRingsMemo.at < TOWN_RINGS_TTL_MS) {
    const hit = townRingsMemo.byTown.get(town)
    if (hit) return hit
  }
  if (!townRingsMemo || now - townRingsMemo.at >= TOWN_RINGS_TTL_MS) {
    townRingsMemo = { at: now, byTown: new Map() }
  }
  const zips = zipsForTown(town)
  const { rings } = await getZipBoundaryRings(zips, { fetchMissing: false })
  const townRings = zips.flatMap((zip) => rings.get(zip) ?? [])
  townRingsMemo.byTown.set(town, townRings)
  return townRings
}

export async function geocodeStreetAddress(address: {
  street: string
  city: string
  state: string
  zip?: string | null
}): Promise<{ latitude: number; longitude: number } | null> {
  const street = address.street.trim()
  const city = address.city.trim()
  const state = address.state.trim()
  if (!street || !city || !state) return null

  const url = new URL(CENSUS_GEOCODER)
  url.searchParams.set('street', street)
  url.searchParams.set('city', city)
  url.searchParams.set('state', state)
  const zip = address.zip?.trim()
  if (zip) url.searchParams.set('zip', zip)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('format', 'json')

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'tmre-website/listing-map-point' },
    })
    if (!res.ok) return null
    return censusGeocodeCoordinates(await res.json())
  } catch (err) {
    console.warn(
      '[listing-map-point] Census geocode failed',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function resolveListingMapPointUncached(
  listing: ListingMapInput,
): Promise<ListingMapPoint | null> {
  const mls = { latitude: listing.latitude, longitude: listing.longitude }
  const town = resolveListingTownKey(listing.address.postalCode, listing.address.city)

  let townRings: TownRing[] = []
  if (town) {
    try {
      townRings = await townRingsFor(town)
    } catch (err) {
      console.warn(
        '[listing-map-point] zip rings unavailable',
        err instanceof Error ? err.message : err,
      )
    }
  }

  const mlsPoint = finiteLatLon(mls.latitude, mls.longitude)
  if (
    mlsPoint &&
    (townRings.length === 0 ||
      pointInTownRings(mlsPoint.latitude, mlsPoint.longitude, townRings))
  ) {
    return resolveListingMapPointFromParts({ mls, geocode: null, townRings })
  }

  const street = listingStreetLine(listing.address)
  const geocode = await geocodeStreetAddress({
    street,
    city: listing.address.city?.trim() || town || '',
    state: listing.address.state?.trim() || 'CT',
    zip: listing.address.postalCode,
  })

  return resolveListingMapPointFromParts({ mls, geocode, townRings })
}

/**
 * Plotting pin for listing maps. Never writes back to `listing.latitude`.
 * Uses stored MLS when that point sits inside the listing's town zip
 * outlines; otherwise a Census geocode of street + city + state + zip.
 */
export async function resolveListingMapPoint(
  listing: ListingMapInput,
): Promise<ListingMapPoint | null> {
  const key = listingMapPointCacheKey(listing)
  if (pointCache.has(key)) return pointCache.get(key) ?? null
  try {
    return cachePoint(key, await resolveListingMapPointUncached(listing))
  } catch (err) {
    console.warn(
      '[listing-map-point] resolve failed',
      err instanceof Error ? err.message : err,
    )
    return cachePoint(
      key,
      resolveListingMapPointFromParts({
        mls: { latitude: listing.latitude, longitude: listing.longitude },
        geocode: null,
        townRings: [],
      }),
    )
  }
}
