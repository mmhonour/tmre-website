import { pointInRings } from '@/lib/location-estimate-zip-grid-shared'

export type ListingMapPointSource = 'mls' | 'address-geocode'

export type ListingMapPoint = {
  latitude: number
  longitude: number
  source: ListingMapPointSource
}

export type ListingMapCoords = {
  latitude: number | null
  longitude: number | null
}

export type ListingMapAddress = {
  street?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  full?: string | null
}

export type ListingMapInput = ListingMapCoords & {
  address: ListingMapAddress
}

export type TownRing = readonly [number, number][]

export function finiteLatLon(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number; longitude: number } | null {
  const lat = latitude != null ? Number(latitude) : NaN
  const lon = longitude != null ? Number(longitude) : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return null
  }
  return { latitude: lat, longitude: lon }
}

export function isFiniteLatLon(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return finiteLatLon(latitude, longitude) != null
}

export function pointInTownRings(
  latitude: number,
  longitude: number,
  rings: readonly TownRing[],
): boolean {
  if (rings.length === 0) return false
  return pointInRings(longitude, latitude, rings)
}

export function listingStreetLine(address: ListingMapAddress): string {
  const street = address.street?.trim()
  if (street) return street
  const full = address.full?.trim()
  if (!full) return ''
  return full.split(',')[0]!.trim()
}

export function listingMapPointCacheKey(listing: ListingMapInput): string {
  return [
    listingStreetLine(listing.address),
    listing.address.city?.trim() ?? '',
    listing.address.state?.trim() ?? '',
    listing.address.postalCode?.trim() ?? '',
    listing.latitude ?? '',
    listing.longitude ?? '',
  ].join('|')
}

/**
 * Display pin for listing maps. Prefer the chrome `mapPoint` (MLS when it
 * sits in the named town, otherwise a Census street geocode). Does not
 * rewrite stored MLS lat/lon.
 */
export function listingDisplayMapPoint(
  listing: ListingMapCoords,
  mapPoint?: ListingMapPoint | null,
): ListingMapCoords {
  const chosen = mapPoint
    ? finiteLatLon(mapPoint.latitude, mapPoint.longitude)
    : null
  if (chosen) return chosen
  return { latitude: listing.latitude, longitude: listing.longitude }
}

export function resolveListingMapPointFromParts(input: {
  mls: ListingMapCoords
  geocode: ListingMapCoords | null
  townRings: readonly TownRing[]
}): ListingMapPoint | null {
  const mls = finiteLatLon(input.mls.latitude, input.mls.longitude)
  const geocode = finiteLatLon(
    input.geocode?.latitude,
    input.geocode?.longitude,
  )

  if (input.townRings.length === 0) {
    return mls ? { ...mls, source: 'mls' } : null
  }

  if (mls && pointInTownRings(mls.latitude, mls.longitude, input.townRings)) {
    return { ...mls, source: 'mls' }
  }

  if (
    geocode &&
    pointInTownRings(geocode.latitude, geocode.longitude, input.townRings)
  ) {
    return { ...geocode, source: 'address-geocode' }
  }

  return mls ? { ...mls, source: 'mls' } : null
}

/** Census `locations/address` JSON — `x` is lon, `y` is lat. */
export function censusGeocodeCoordinates(
  json: unknown,
): { latitude: number; longitude: number } | null {
  if (!json || typeof json !== 'object') return null
  const result = (json as { result?: { addressMatches?: unknown } }).result
  const matches = result?.addressMatches
  if (!Array.isArray(matches) || matches.length === 0) return null
  const first = matches[0]
  if (!first || typeof first !== 'object') return null
  const coords = (first as { coordinates?: { x?: unknown; y?: unknown } }).coordinates
  return finiteLatLon(Number(coords?.y), Number(coords?.x))
}
