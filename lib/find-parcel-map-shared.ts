import type { ComparablesCriteria } from '@/lib/listing-comparables-shared'
import { classifyYearBuilt, VINTAGE_BUCKETS } from '@/lib/vintage-buckets'
import { normalizeStreetLine } from '@/lib/property-address'
import { normalizeZip } from '@/lib/tmre-towns'

export const FIND_PARCEL_MAP_RADIUS_MILES = 0.35
export const FIND_PARCEL_MAP_POOL_MILES = 1.2

export type FindParcelMapMode = 'around' | 'like-kind'
export type FindParcelMapAroundFilter =
  | 'all'
  | 'same_street'
  | 'cross_street'
  | 'radius'

export type FindParcelMapRelation = 'same_street' | 'cross_street' | 'radius'

export type FindParcelMapPin = {
  key: string
  address: string
  city?: string | null
  price: number
  score: number
  isRental: boolean
  beds?: number | null
  baths?: number | null
  sqft: number | null
  latitude?: number | null
  longitude?: number | null
  photoCount?: number | null
}

export type FindParcelMapNeighbor = {
  pin: FindParcelMapPin
  relation: FindParcelMapRelation
  miles: number
  zip: string | null
  vintageLabel: string
  yearBuilt: number | null
  furnished: ComparablesCriteria['furnished'] | null
  href: string
}

export type FindParcelMapPayload = {
  street: string
  subject: FindParcelMapPin | null
  subjectKey: string | null
  radiusMiles: number
  neighbors: FindParcelMapNeighbor[]
  criteria: ComparablesCriteria | null
  missingCriteria: string[]
  boundZips: readonly string[]
  highlightZip: string | null
}

/** Street name without house number (`12 main st` → `main st`). */
export function streetNameKey(street: string): string {
  const line = normalizeStreetLine(street)
  return line.replace(/^\d+[a-z]?\s+/, '').trim()
}

export function sameStreetName(a: string, b: string): boolean {
  const left = streetNameKey(a)
  const right = streetNameKey(b)
  return Boolean(left && right && left === right)
}

export function milesBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const r = 3958.8
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function classifyFindParcelRelation(
  subjectStreet: string,
  neighborStreet: string,
  miles: number,
  radiusMiles = FIND_PARCEL_MAP_RADIUS_MILES,
): FindParcelMapRelation | null {
  if (sameStreetName(subjectStreet, neighborStreet)) return 'same_street'
  if (miles <= radiusMiles) return 'cross_street'
  return null
}

export function neighborMatchesAroundFilter(
  neighbor: Pick<FindParcelMapNeighbor, 'relation' | 'miles'>,
  filter: FindParcelMapAroundFilter,
  radiusMiles = FIND_PARCEL_MAP_RADIUS_MILES,
): boolean {
  if (filter === 'all') return true
  if (filter === 'same_street') return neighbor.relation === 'same_street'
  if (filter === 'cross_street') return neighbor.relation === 'cross_street'
  return neighbor.miles <= radiusMiles
}

export type FindParcelMapBounds = {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

const MILES_PER_DEG_LAT = 69

function lonMilesPerDeg(lat: number): number {
  return MILES_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180))
}

function coordsOf(
  pin: { latitude?: number | null; longitude?: number | null },
): { lat: number; lon: number } | null {
  if (pin.latitude == null || pin.longitude == null) return null
  return { lat: pin.latitude, lon: pin.longitude }
}

export function boxFromLonLats(
  points: readonly { lat: number; lon: number }[],
): FindParcelMapBounds | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const point of points) {
    if (point.lat < minLat) minLat = point.lat
    if (point.lat > maxLat) maxLat = point.lat
    if (point.lon < minLon) minLon = point.lon
    if (point.lon > maxLon) maxLon = point.lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

export function padBoundsMiles(
  box: FindParcelMapBounds,
  miles: number,
): FindParcelMapBounds {
  const midLat = (box.minLat + box.maxLat) / 2
  const latPad = miles / MILES_PER_DEG_LAT
  const lonPad = miles / lonMilesPerDeg(midLat)
  return {
    minLat: box.minLat - latPad,
    maxLat: box.maxLat + latPad,
    minLon: box.minLon - lonPad,
    maxLon: box.maxLon + lonPad,
  }
}

export function radiusBounds(
  center: { lat: number; lon: number },
  miles: number,
): FindParcelMapBounds {
  return padBoundsMiles(
    {
      minLat: center.lat,
      maxLat: center.lat,
      minLon: center.lon,
      maxLon: center.lon,
    },
    miles,
  )
}

function unionBounds(
  a: FindParcelMapBounds,
  b: FindParcelMapBounds,
): FindParcelMapBounds {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLon: Math.max(a.maxLon, b.maxLon),
  }
}

/**
 * Camera box for an Around-this-home chip. Initial load / Reset stay on the
 * town outline — this is only for a chip click.
 */
export function aroundFocusBounds(
  filter: FindParcelMapAroundFilter,
  subject: { latitude?: number | null; longitude?: number | null },
  neighbors: readonly FindParcelMapNeighbor[],
  radiusMiles = FIND_PARCEL_MAP_RADIUS_MILES,
): FindParcelMapBounds | null {
  const house = coordsOf(subject)
  if (!house) return null
  if (filter === 'radius') return radiusBounds(house, radiusMiles)

  const rows =
    filter === 'same_street'
      ? neighbors.filter((row) => row.relation === 'same_street')
      : filter === 'cross_street'
        ? neighbors.filter(
            (row) =>
              row.relation === 'same_street' || row.relation === 'cross_street',
          )
        : neighbors

  const points = [
    house,
    ...rows
      .map((row) => coordsOf(row.pin))
      .filter((point): point is { lat: number; lon: number } => point != null),
  ]
  const raw = boxFromLonLats(points)
  if (!raw) {
    return radiusBounds(house, filter === 'same_street' ? 0.08 : radiusMiles)
  }

  const padMiles =
    filter === 'same_street' ? 0.05 : filter === 'cross_street' ? 0.08 : 0.06
  const padded = padBoundsMiles(raw, padMiles)
  if (filter !== 'cross_street') return padded

  // Cross streets must read wider than the street itself even when only a
  // couple of pins exist — keep at least a short-block look at the house.
  return unionBounds(padded, radiusBounds(house, Math.min(radiusMiles, 0.22)))
}

export function criteriaFromParcelFacts(facts: {
  zip?: string | null
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  yearBuilt?: number | null
}): { criteria: ComparablesCriteria | null; missingCriteria: string[] } {
  const zip = normalizeZip(facts.zip) ?? '06880'
  const missing: string[] = []
  if (facts.beds == null) missing.push('bedrooms')
  if (facts.baths == null) missing.push('bathrooms')
  if (missing.length > 0) {
    return { criteria: null, missingCriteria: missing }
  }
  const vintageBucket = classifyYearBuilt(facts.yearBuilt)
  const vintageLabel =
    VINTAGE_BUCKETS.find((bucket) => bucket.id === vintageBucket)?.label ??
    'Unknown'
  return {
    criteria: {
      zip,
      beds: facts.beds!,
      baths: facts.baths!,
      lotAcres: null,
      sqft: facts.sqft != null && facts.sqft > 0 ? facts.sqft : null,
      vintageBucket,
      vintageLabel,
    },
    missingCriteria: [],
  }
}
