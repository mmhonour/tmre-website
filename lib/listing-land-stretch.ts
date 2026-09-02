import { nearestPoint } from '@/lib/geo-distance'
import { normalizeStreetAddress } from '@/lib/listing-history'
import {
  TOWN_CENTERS,
  WATER_ACCESS_POINTS,
  ZIP_CENTERS,
  type GeoPoint,
} from '@/lib/tmre-geo'
import { townForZip, type TmreTown } from '@/lib/tmre-towns'
import { COMPARABLES_DEFAULT_LOOKBACK_MONTHS } from '@/lib/listing-comparables-shared'
import { withinLookbackMonths } from '@/lib/listing-comparables-shared'

/**
 * Land-value stretch — a corridor of land, not a radius around the house.
 *
 * Suburban sale prices often follow the dirt (water, in-town) more than
 * finishes. This module scores that from historical solds on a 1/4-mile
 * stretch. It is listing-agnostic: same rules for every subject.
 */

/** Full length of the corridor, miles. */
export const LAND_STRETCH_LENGTH_MILES = 0.25
/** Half-width of the corridor (~320 ft). A 1/4-mile *radius* would be much wider. */
export const LAND_STRETCH_HALF_WIDTH_MILES = 0.06
/** Minimum solds before we will claim the stretch explains a premium. */
export const LAND_STRETCH_MIN_SOLDS = 3
/** Same default look-back as comps — recent sales, not the 36-month reservoir. */
export const LAND_STRETCH_LOOKBACK_MONTHS = COMPARABLES_DEFAULT_LOOKBACK_MONTHS
export const LAND_STRETCH_ALGO_VERSION = 1

/** Water tiers already used by location premium (coastal neighborhood = 1.4 mi). */
const WATER_STRETCH_MAX_MILES = 1.4
/** Town/zip-center tiers already used by location premium. */
const CENTER_STRETCH_MAX_MILES = 2.0

const MILES_PER_DEG_LAT = 69.172

export type LandStretchAxis = 'water' | 'center' | 'street'

export type StretchSale = {
  id: string
  latitude: number
  longitude: number
  pricePerSqft: number
  closeDate: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  street: string | null
}

export type StretchSubject = {
  id: string
  latitude: number
  longitude: number
  postalCode?: string | null
  city?: string | null
  street?: string | null
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  pricePerSqft: number | null
}

export type LandStretchCandidate = {
  axis: LandStretchAxis
  soldCount: number
  stretchMedianPpsf: number
  stretchPremiumPct: number
}

export type LandStretchInsight = {
  algoVersion: number
  axis: LandStretchAxis | null
  soldCount: number
  stretchMedianPpsf: number | null
  cityMedianPpsf: number | null
  listingPpsf: number | null
  stretchPremiumPct: number | null
  listingPremiumPct: number | null
  explainsLandPremium: boolean
  labels: string[]
  candidates: LandStretchCandidate[]
}

export function emptyLandStretchInsight(
  listingPpsf: number | null = null,
  cityMedianPpsf: number | null = null,
): LandStretchInsight {
  return {
    algoVersion: LAND_STRETCH_ALGO_VERSION,
    axis: null,
    soldCount: 0,
    stretchMedianPpsf: null,
    cityMedianPpsf,
    listingPpsf,
    stretchPremiumPct: null,
    listingPremiumPct: premiumPct(listingPpsf, cityMedianPpsf),
    explainsLandPremium: false,
    labels: [],
    candidates: [],
  }
}

/** Street name without house number, for same-street stretch matching. */
export function streetNameKey(street: string | null | undefined): string {
  if (!street) return ''
  return normalizeStreetAddress(street)
    .replace(/^\d+[A-Z]?\s+/, '')
    .trim()
}

export type LocalOffset = { east: number; north: number }

/** Local east/north miles from origin — cheap tangent plane, fine at 1/4 mile. */
export function localEastNorth(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number,
): LocalOffset {
  const latRad = (originLat * Math.PI) / 180
  return {
    east: (lon - originLon) * Math.cos(latRad) * MILES_PER_DEG_LAT,
    north: (lat - originLat) * MILES_PER_DEG_LAT,
  }
}

export type AxisUnit = { east: number; north: number }

export function unitOffset(east: number, north: number): AxisUnit | null {
  const len = Math.hypot(east, north)
  if (len < 1e-9) return null
  return { east: east / len, north: north / len }
}

/** Rotate 90° — used for a shore-parallel axis from the inland/water vector. */
export function perpendicularAxis(axis: AxisUnit): AxisUnit {
  return { east: -axis.north, north: axis.east }
}

/**
 * Project a point onto a corridor through the origin.
 * `along` is distance on the stretch; `across` is the inland/side offset.
 */
export function projectOnAxis(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number,
  axis: AxisUnit,
): { along: number; across: number } {
  const { east, north } = localEastNorth(originLat, originLon, lat, lon)
  const along = east * axis.east + north * axis.north
  const across = -east * axis.north + north * axis.east
  return { along, across }
}

export function inLandStretch(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number,
  axis: AxisUnit,
  halfLengthMiles: number = LAND_STRETCH_LENGTH_MILES / 2,
  halfWidthMiles: number = LAND_STRETCH_HALF_WIDTH_MILES,
): boolean {
  const { along, across } = projectOnAxis(originLat, originLon, lat, lon, axis)
  return Math.abs(along) <= halfLengthMiles && Math.abs(across) <= halfWidthMiles
}

export function medianNumber(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export function premiumPct(
  value: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  if (value == null || baseline == null || baseline <= 0 || value <= 0) return null
  return (value - baseline) / baseline
}

function townCenterPoint(
  zip: string | null | undefined,
  town: TmreTown | null,
): GeoPoint | null {
  const z = zip?.trim().slice(0, 5) ?? null
  if (z && ZIP_CENTERS[z]) return ZIP_CENTERS[z]!
  if (town) return TOWN_CENTERS[town]
  return null
}

export type AmenityAxes = {
  water: { axis: AxisUnit; miles: number } | null
  center: { axis: AxisUnit; miles: number } | null
  street: AxisUnit | null
}

/**
 * Generic amenity axes for any lat/lon. Water = shore-parallel (not inland).
 * Center = corridor toward the village. Street = bearing of same-street solds.
 */
export function amenityAxesForSubject(
  subject: StretchSubject,
  sales: readonly StretchSale[],
): AmenityAxes {
  const town = townForZip(subject.postalCode) ?? null
  const waterHit = nearestPoint(subject.latitude, subject.longitude, WATER_ACCESS_POINTS)
  const centerPt = townCenterPoint(subject.postalCode, town)

  let water: AmenityAxes['water'] = null
  if (waterHit && waterHit.miles <= WATER_STRETCH_MAX_MILES) {
    const inland = localEastNorth(
      subject.latitude,
      subject.longitude,
      waterHit.point.lat,
      waterHit.point.lon,
    )
    const inlandAxis = unitOffset(inland.east, inland.north)
    if (inlandAxis) {
      water = { axis: perpendicularAxis(inlandAxis), miles: waterHit.miles }
    }
  }

  let center: AmenityAxes['center'] = null
  if (centerPt) {
    const toCenter = localEastNorth(
      subject.latitude,
      subject.longitude,
      centerPt.lat,
      centerPt.lon,
    )
    const centerAxis = unitOffset(toCenter.east, toCenter.north)
    const miles = Math.hypot(toCenter.east, toCenter.north)
    if (centerAxis && miles <= CENTER_STRETCH_MAX_MILES) {
      center = { axis: centerAxis, miles }
    }
  }

  return {
    water,
    center,
    street: streetAxisFromSales(subject, sales),
  }
}

function streetAxisFromSales(
  subject: StretchSubject,
  sales: readonly StretchSale[],
): AxisUnit | null {
  const key = streetNameKey(subject.street)
  if (!key) return null
  const peers = sales.filter((sale) => {
    if (sale.id === subject.id) return false
    return streetNameKey(sale.street) === key
  })
  if (peers.length < 2) return null

  let east = 0
  let north = 0
  for (const sale of peers) {
    const off = localEastNorth(
      subject.latitude,
      subject.longitude,
      sale.latitude,
      sale.longitude,
    )
    // Flip so the running sum does not cancel opposite directions.
    const sign = off.east < 0 || (off.east === 0 && off.north < 0) ? -1 : 1
    east += off.east * sign
    north += off.north * sign
  }
  return unitOffset(east, north)
}

function similarHouse(subject: StretchSubject, sale: StretchSale): boolean {
  if (
    subject.beds != null &&
    sale.beds != null &&
    Math.abs(sale.beds - subject.beds) > 1
  ) {
    return false
  }
  if (
    subject.sqft != null &&
    subject.sqft > 0 &&
    sale.sqft != null &&
    sale.sqft > 0
  ) {
    const ratio = sale.sqft / subject.sqft
    if (ratio < 0.5 || ratio > 2) return false
  }
  return true
}

function salesOnStretch(
  subject: StretchSubject,
  sales: readonly StretchSale[],
  axis: AxisUnit,
  nowMs: number,
): StretchSale[] {
  return sales.filter((sale) => {
    if (sale.id === subject.id) return false
    if (!(sale.pricePerSqft > 0)) return false
    if (!withinLookbackMonths(sale.closeDate, LAND_STRETCH_LOOKBACK_MONTHS, nowMs)) {
      return false
    }
    return inLandStretch(
      subject.latitude,
      subject.longitude,
      sale.latitude,
      sale.longitude,
      axis,
    )
  })
}

function candidateFromSales(
  axis: LandStretchAxis,
  onStretch: readonly StretchSale[],
  subject: StretchSubject,
  cityMedianPpsf: number,
): LandStretchCandidate | null {
  const similar = onStretch.filter((sale) => similarHouse(subject, sale))
  const pool = similar.length >= LAND_STRETCH_MIN_SOLDS ? similar : onStretch
  const medianPpsf = medianNumber(pool.map((sale) => sale.pricePerSqft))
  if (medianPpsf == null || pool.length === 0) return null
  const stretchPremiumPct = premiumPct(medianPpsf, cityMedianPpsf)
  if (stretchPremiumPct == null) return null
  return {
    axis,
    soldCount: pool.length,
    stretchMedianPpsf: medianPpsf,
    stretchPremiumPct,
  }
}

export function landStretchExplainsPremium(
  listingPpsf: number | null,
  cityMedianPpsf: number | null,
  stretchMedianPpsf: number | null,
  soldCount: number,
): boolean {
  if (soldCount < LAND_STRETCH_MIN_SOLDS) return false
  const listingPremium = premiumPct(listingPpsf, cityMedianPpsf)
  const stretchPremium = premiumPct(stretchMedianPpsf, cityMedianPpsf)
  if (
    listingPremium == null ||
    stretchPremium == null ||
    listingPpsf == null ||
    stretchMedianPpsf == null
  ) {
    return false
  }
  if (listingPremium <= 0.05 || stretchPremium <= 0.05) return false
  const closeToStretch =
    Math.abs(listingPpsf - stretchMedianPpsf) / stretchMedianPpsf <= 0.35
  return closeToStretch || stretchPremium >= 0.4 * listingPremium
}

function pickCandidate(
  candidates: LandStretchCandidate[],
  listingPpsf: number | null,
  cityMedianPpsf: number | null,
): LandStretchCandidate | null {
  if (candidates.length === 0) return null
  const explaining = candidates.filter((c) =>
    landStretchExplainsPremium(
      listingPpsf,
      cityMedianPpsf,
      c.stretchMedianPpsf,
      c.soldCount,
    ),
  )
  const pool = explaining.length > 0 ? explaining : candidates
  return [...pool].sort((a, b) => {
    if (b.stretchPremiumPct !== a.stretchPremiumPct) {
      return b.stretchPremiumPct - a.stretchPremiumPct
    }
    return b.soldCount - a.soldCount
  })[0] ?? null
}

function labelsFor(axes: AmenityAxes, picked: LandStretchAxis | null): string[] {
  const labels: string[] = []
  if (axes.water && (picked === 'water' || picked == null)) {
    labels.push('Near the water')
  }
  if (axes.center && (picked === 'center' || picked == null)) {
    labels.push('Near town center')
  }
  if (picked === 'street') labels.push('Same-street stretch')
  if (picked === 'water' && !labels.includes('Near the water')) {
    labels.unshift('Near the water')
  }
  if (picked === 'center' && !labels.includes('Near town center')) {
    labels.unshift('Near town center')
  }
  return labels
}

/**
 * Score land value from solds on amenity stretches. No listing-specific rules.
 */
export function computeLandStretchInsight(
  subject: StretchSubject,
  sales: readonly StretchSale[],
  cityMedianPpsf: number | null,
  nowMs: number = Date.now(),
): LandStretchInsight {
  const listingPpsf = subject.pricePerSqft
  const empty = emptyLandStretchInsight(listingPpsf, cityMedianPpsf)
  if (
    !Number.isFinite(subject.latitude) ||
    !Number.isFinite(subject.longitude) ||
    cityMedianPpsf == null ||
    cityMedianPpsf <= 0
  ) {
    return empty
  }

  const axes = amenityAxesForSubject(subject, sales)
  const candidates: LandStretchCandidate[] = []

  if (axes.water) {
    const c = candidateFromSales(
      'water',
      salesOnStretch(subject, sales, axes.water.axis, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }
  if (axes.center) {
    const c = candidateFromSales(
      'center',
      salesOnStretch(subject, sales, axes.center.axis, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }
  if (axes.street) {
    const c = candidateFromSales(
      'street',
      salesOnStretch(subject, sales, axes.street, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }

  const picked = pickCandidate(candidates, listingPpsf, cityMedianPpsf)
  if (!picked) {
    return { ...empty, labels: labelsFor(axes, null), candidates }
  }

  return {
    algoVersion: LAND_STRETCH_ALGO_VERSION,
    axis: picked.axis,
    soldCount: picked.soldCount,
    stretchMedianPpsf: picked.stretchMedianPpsf,
    cityMedianPpsf,
    listingPpsf,
    stretchPremiumPct: picked.stretchPremiumPct,
    listingPremiumPct: premiumPct(listingPpsf, cityMedianPpsf),
    explainsLandPremium: landStretchExplainsPremium(
      listingPpsf,
      cityMedianPpsf,
      picked.stretchMedianPpsf,
      picked.soldCount,
    ),
    labels: labelsFor(axes, picked.axis),
    candidates,
  }
}

/** Insight tail when the stretch itself trades at a premium. Null = no causal claim. */
export function formatLandStretchInsightTail(
  land: LandStretchInsight | null | undefined,
): string | null {
  if (!land?.explainsLandPremium) return null
  if (land.axis === 'water') {
    return 'in line with recent sales on this waterfront stretch of land'
  }
  if (land.axis === 'center') {
    return 'in line with recent sales on this in-town stretch of land'
  }
  return 'in line with recent sales on this stretch of land'
}
