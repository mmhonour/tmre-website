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
