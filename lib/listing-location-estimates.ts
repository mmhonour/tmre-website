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
 * Location estimates — sold PPSF in coastal areas and town centers.
 *
 * Two places typically trade above the town median: coastal areas and
 * town centers. Geometry differs:
 *   - Town center: 1/4-mile radius disk around the village / zip center.
 *   - Coastal: shore-parallel land strips that step inland from the water.
 *     Each inland strip is treated as ~25% less valuable than the one in
 *     front of it, out to about 3/4–1 mile. Solds are matched in the same
 *     strip along a 1/4-mile coastal stretch — not a radius.
 * Street corridors are an internal fallback only.
 * Listing-agnostic. Distinct from What-if location-premium weights.
 */

/** Along-shore length of a coastal strip, and the old street-corridor length. */
export const LOCATION_STRETCH_LENGTH_MILES = 0.25
/** @deprecated Use LOCATION_STRETCH_LENGTH_MILES — kept for street corridor math. */
export const LOCATION_CORRIDOR_LENGTH_MILES = LOCATION_STRETCH_LENGTH_MILES
/** Half-width of the street fallback corridor (~320 ft). */
export const LOCATION_CORRIDOR_HALF_WIDTH_MILES = 0.06
/** Town-center comparable disk. */
export const TOWN_CENTER_RADIUS_MILES = 0.25
/** Inland depth of one coastal strip. */
export const COASTAL_STRIP_WIDTH_MILES = 0.25
/** Stop stepping inland around 1 mile from the water. */
export const COASTAL_INLAND_MAX_MILES = 1
/** Each inland strip is ~25% less valuable than the one closer to water. */
export const COASTAL_STRIP_VALUE_FACTOR = 0.75
/** Minimum solds before we will claim the stretch explains a premium. */
export const LOCATION_ESTIMATE_MIN_SOLDS = 3
/** Same default look-back as comps — recent sales, not the 36-month reservoir. */
export const LOCATION_ESTIMATE_LOOKBACK_MONTHS = COMPARABLES_DEFAULT_LOOKBACK_MONTHS
/** Bumped when town-center radius + coastal strips replaced a single corridor. */
export const LOCATION_ESTIMATE_ALGO_VERSION = 2

const MILES_PER_DEG_LAT = 69.172
const COASTAL_STRIP_MAX_INDEX = Math.floor(
  (COASTAL_INLAND_MAX_MILES - 1e-9) / COASTAL_STRIP_WIDTH_MILES,
)

export type LocationEstimateKind = 'coastal' | 'town_center' | 'street'
export type LocationEstimateGeometry = 'radius' | 'strip' | 'corridor'

export type EstimateSale = {
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

export type EstimateSubject = {
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

export type LocationEstimateCandidate = {
  axis: LocationEstimateKind
  soldCount: number
  soldMedianPpsf: number
  soldPremiumPct: number
}

export type CoastalStripInfo = {
  /** 0 = first coastal strip; 1 = next inland; … */
  index: number
  inlandMiles: number
  /** Rule of thumb vs the waterfront strip: 0.75^index. */
  relativeValue: number
}

export type LocationEstimate = {
  algoVersion: number
  /** coastal | town_center (product); street is an internal fallback only. */
  kind: LocationEstimateKind | null
  /** Same as kind — kept for older cache rows. */
  axis: LocationEstimateKind | null
  geometry: LocationEstimateGeometry | null
  coastalStrip: CoastalStripInfo | null
  soldCount: number
  soldMedianPpsf: number | null
  cityMedianPpsf: number | null
  listingPpsf: number | null
  soldPremiumPct: number | null
  listingPremiumPct: number | null
  explainsLocation: boolean
  labels: string[]
  candidates: LocationEstimateCandidate[]
}

export function emptyLocationEstimate(
  listingPpsf: number | null = null,
  cityMedianPpsf: number | null = null,
): LocationEstimate {
  return {
    algoVersion: LOCATION_ESTIMATE_ALGO_VERSION,
    kind: null,
    axis: null,
    geometry: null,
    coastalStrip: null,
    soldCount: 0,
    soldMedianPpsf: null,
    cityMedianPpsf,
    listingPpsf,
    soldPremiumPct: null,
    listingPremiumPct: premiumPct(listingPpsf, cityMedianPpsf),
    explainsLocation: false,
    labels: [],
    candidates: [],
  }
}

export function geometryForKind(
  kind: LocationEstimateKind | null,
): LocationEstimateGeometry | null {
  if (kind === 'town_center') return 'radius'
  if (kind === 'coastal') return 'strip'
  if (kind === 'street') return 'corridor'
  return null
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

/** Inverse of `localEastNorth` — place a point by east/north miles. */
export function offsetLatLon(
  originLat: number,
  originLon: number,
  eastMiles: number,
  northMiles: number,
): { lat: number; lon: number } {
  const latRad = (originLat * Math.PI) / 180
  return {
    lat: originLat + northMiles / MILES_PER_DEG_LAT,
    lon: originLon + eastMiles / (MILES_PER_DEG_LAT * Math.cos(latRad)),
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
 * `along` is distance on the corridor; `across` is the inland/side offset.
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

export function inLocationCorridor(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number,
  axis: AxisUnit,
  halfLengthMiles: number = LOCATION_CORRIDOR_LENGTH_MILES / 2,
  halfWidthMiles: number = LOCATION_CORRIDOR_HALF_WIDTH_MILES,
): boolean {
  const { along, across } = projectOnAxis(originLat, originLon, lat, lon, axis)
  return Math.abs(along) <= halfLengthMiles && Math.abs(across) <= halfWidthMiles
}

export function inTownCenterRadius(
  centerLat: number,
  centerLon: number,
  lat: number,
  lon: number,
  radiusMiles: number = TOWN_CENTER_RADIUS_MILES,
): boolean {
  const { east, north } = localEastNorth(centerLat, centerLon, lat, lon)
  return Math.hypot(east, north) <= radiusMiles
}

/**
 * Signed miles inland of the local shore line through `water`.
 * `towardWater` is the subject→water unit; positive is inland.
 */
export function inlandMilesFromWaterLine(
  waterLat: number,
  waterLon: number,
  towardWater: AxisUnit,
  lat: number,
  lon: number,
): number {
  const { east, north } = localEastNorth(waterLat, waterLon, lat, lon)
  return -(east * towardWater.east + north * towardWater.north)
}

export function coastalStripIndex(inlandMiles: number): number | null {
  if (!Number.isFinite(inlandMiles)) return null
  const inland = Math.max(0, inlandMiles)
  if (inland > COASTAL_INLAND_MAX_MILES) return null
  const capped = Math.min(inland, COASTAL_INLAND_MAX_MILES - 1e-9)
  return Math.min(
    Math.floor(capped / COASTAL_STRIP_WIDTH_MILES),
    COASTAL_STRIP_MAX_INDEX,
  )
}

export function coastalStripRelativeValue(stripIndex: number): number {
  if (!Number.isFinite(stripIndex) || stripIndex <= 0) return 1
  return COASTAL_STRIP_VALUE_FACTOR ** stripIndex
}

export function coastalStripInfo(inlandMiles: number): CoastalStripInfo | null {
  const index = coastalStripIndex(inlandMiles)
  if (index == null) return null
  return {
    index,
    inlandMiles: Math.max(0, inlandMiles),
    relativeValue: coastalStripRelativeValue(index),
  }
}

export function inCoastalStrip(
  water: GeoPoint,
  towardWater: AxisUnit,
  shoreAxis: AxisUnit,
  subjectLat: number,
  subjectLon: number,
  saleLat: number,
  saleLon: number,
  subjectStrip: number,
): boolean {
  const inland = inlandMilesFromWaterLine(
    water.lat,
    water.lon,
    towardWater,
    saleLat,
    saleLon,
  )
  const strip = coastalStripIndex(inland)
  if (strip == null || strip !== subjectStrip) return false
  const { along } = projectOnAxis(
    subjectLat,
    subjectLon,
    saleLat,
    saleLon,
    shoreAxis,
  )
  return Math.abs(along) <= LOCATION_STRETCH_LENGTH_MILES / 2
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

export type CoastalAxis = {
  axis: AxisUnit
  towardWater: AxisUnit
  water: GeoPoint
  inlandMiles: number
  stripIndex: number
}

export type AmenityAxes = {
  coastal: CoastalAxis | null
  townCenter: { center: GeoPoint; miles: number } | null
  street: AxisUnit | null
}

/**
 * Axes for any lat/lon. Coastal = shore-parallel strips from the nearest
 * water point. Town center = village disk. Street is an internal fallback only.
 */
export function locationAxesForSubject(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
): AmenityAxes {
  const town = townForZip(subject.postalCode) ?? null
  const coastalHit = nearestPoint(subject.latitude, subject.longitude, WATER_ACCESS_POINTS)
  const centerPt = townCenterPoint(subject.postalCode, town)

  let coastal: AmenityAxes['coastal'] = null
  if (coastalHit) {
    const inland = localEastNorth(
      subject.latitude,
      subject.longitude,
      coastalHit.point.lat,
      coastalHit.point.lon,
    )
    const towardWater = unitOffset(inland.east, inland.north)
    const inlandMiles = inlandMilesFromWaterLine(
      coastalHit.point.lat,
      coastalHit.point.lon,
      towardWater ?? { east: 0, north: 1 },
      subject.latitude,
      subject.longitude,
    )
    const strip = towardWater ? coastalStripIndex(inlandMiles) : null
    if (towardWater && strip != null) {
      coastal = {
        axis: perpendicularAxis(towardWater),
        towardWater,
        water: coastalHit.point,
        inlandMiles: Math.max(0, inlandMiles),
        stripIndex: strip,
      }
    }
  }

  let townCenter: AmenityAxes['townCenter'] = null
  if (centerPt) {
    const toCenter = localEastNorth(
      subject.latitude,
      subject.longitude,
      centerPt.lat,
      centerPt.lon,
    )
    const miles = Math.hypot(toCenter.east, toCenter.north)
    if (miles <= TOWN_CENTER_RADIUS_MILES) {
      townCenter = { center: centerPt, miles }
    }
  }

  return {
    coastal,
    townCenter,
    street: streetAxisFromSales(subject, sales),
  }
}

function streetAxisFromSales(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
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

function similarHouse(subject: EstimateSubject, sale: EstimateSale): boolean {
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

function isEligibleSale(
  subject: EstimateSubject,
  sale: EstimateSale,
  nowMs: number,
): boolean {
  if (sale.id === subject.id) return false
  if (!(sale.pricePerSqft > 0)) return false
  return withinLookbackMonths(sale.closeDate, LOCATION_ESTIMATE_LOOKBACK_MONTHS, nowMs)
}

function salesOnCorridor(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
  axis: AxisUnit,
  nowMs: number,
): EstimateSale[] {
  return sales.filter((sale) => {
    if (!isEligibleSale(subject, sale, nowMs)) return false
    return inLocationCorridor(
      subject.latitude,
      subject.longitude,
      sale.latitude,
      sale.longitude,
      axis,
    )
  })
}

function salesOnCoastalStrip(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
  coastal: CoastalAxis,
  nowMs: number,
): EstimateSale[] {
  return sales.filter((sale) => {
    if (!isEligibleSale(subject, sale, nowMs)) return false
    return inCoastalStrip(
      coastal.water,
      coastal.towardWater,
      coastal.axis,
      subject.latitude,
      subject.longitude,
      sale.latitude,
      sale.longitude,
      coastal.stripIndex,
    )
  })
}

function salesInTownCenterRadius(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
  center: GeoPoint,
  nowMs: number,
): EstimateSale[] {
  return sales.filter((sale) => {
    if (!isEligibleSale(subject, sale, nowMs)) return false
    return inTownCenterRadius(center.lat, center.lon, sale.latitude, sale.longitude)
  })
}

function candidateFromSales(
  axis: LocationEstimateKind,
  onStretch: readonly EstimateSale[],
  subject: EstimateSubject,
  cityMedianPpsf: number | null,
): LocationEstimateCandidate | null {
  const similar = onStretch.filter((sale) => similarHouse(subject, sale))
  const pool = similar.length >= LOCATION_ESTIMATE_MIN_SOLDS ? similar : onStretch
  const medianPpsf = medianNumber(pool.map((sale) => sale.pricePerSqft))
  if (medianPpsf == null || pool.length === 0) return null
  return {
    axis,
    soldCount: pool.length,
    soldMedianPpsf: medianPpsf,
    soldPremiumPct: premiumPct(medianPpsf, cityMedianPpsf) ?? 0,
  }
}

export function locationEstimateExplains(
  listingPpsf: number | null,
  cityMedianPpsf: number | null,
  soldMedianPpsf: number | null,
  soldCount: number,
): boolean {
  if (soldCount < LOCATION_ESTIMATE_MIN_SOLDS) return false
  const listingPremium = premiumPct(listingPpsf, cityMedianPpsf)
  const stretchPremium = premiumPct(soldMedianPpsf, cityMedianPpsf)
  if (
    listingPremium == null ||
    stretchPremium == null ||
    listingPpsf == null ||
    soldMedianPpsf == null
  ) {
    return false
  }
  if (listingPremium <= 0.05 || stretchPremium <= 0.05) return false
  const closeToStretch =
    Math.abs(listingPpsf - soldMedianPpsf) / soldMedianPpsf <= 0.35
  return closeToStretch || stretchPremium >= 0.4 * listingPremium
}

function pickCandidate(
  candidates: LocationEstimateCandidate[],
  listingPpsf: number | null,
  cityMedianPpsf: number | null,
): LocationEstimateCandidate | null {
  if (candidates.length === 0) return null
  const explaining = candidates.filter((c) =>
    locationEstimateExplains(
      listingPpsf,
      cityMedianPpsf,
      c.soldMedianPpsf,
      c.soldCount,
    ),
  )
  const product = (explaining.length > 0 ? explaining : candidates).filter(
    (c) => c.axis === 'coastal' || c.axis === 'town_center',
  )
  const pool = product.length > 0 ? product : explaining.length > 0 ? explaining : candidates
  return [...pool].sort((a, b) => {
    if (b.soldMedianPpsf !== a.soldMedianPpsf) {
      return b.soldMedianPpsf - a.soldMedianPpsf
    }
    return b.soldCount - a.soldCount
  })[0] ?? null
}

function labelsFor(axes: AmenityAxes, picked: LocationEstimateKind | null): string[] {
  const labels: string[] = []
  if (axes.coastal && (picked === 'coastal' || picked == null)) {
    labels.push('Coastal area')
  }
  if (axes.townCenter && (picked === 'town_center' || picked == null)) {
    labels.push('Town center')
  }
  if (picked === 'street') labels.push('Same street')
  if (picked === 'coastal' && !labels.includes('Coastal area')) {
    labels.unshift('Coastal area')
  }
  if (picked === 'town_center' && !labels.includes('Town center')) {
    labels.unshift('Town center')
  }
  return labels
}

/**
 * Score coastal-strip / town-center-radius sold PPSF. No listing-specific rules.
 */
export function computeLocationEstimate(
  subject: EstimateSubject,
  sales: readonly EstimateSale[],
  cityMedianPpsf: number | null,
  nowMs: number = Date.now(),
): LocationEstimate {
  const listingPpsf = subject.pricePerSqft
  const empty = emptyLocationEstimate(listingPpsf, cityMedianPpsf)
  if (
    !Number.isFinite(subject.latitude) ||
    !Number.isFinite(subject.longitude)
  ) {
    return empty
  }

  const axes = locationAxesForSubject(subject, sales)
  const candidates: LocationEstimateCandidate[] = []

  if (axes.coastal) {
    const c = candidateFromSales(
      'coastal',
      salesOnCoastalStrip(subject, sales, axes.coastal, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }
  if (axes.townCenter) {
    const c = candidateFromSales(
      'town_center',
      salesInTownCenterRadius(subject, sales, axes.townCenter.center, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }
  if (axes.street) {
    const c = candidateFromSales(
      'street',
      salesOnCorridor(subject, sales, axes.street, nowMs),
      subject,
      cityMedianPpsf,
    )
    if (c) candidates.push(c)
  }

  const picked = pickCandidate(candidates, listingPpsf, cityMedianPpsf)
  if (!picked) {
    return applyTownMedianToLocationEstimate(
      {
        ...empty,
        coastalStrip: axes.coastal
          ? coastalStripInfo(axes.coastal.inlandMiles)
          : null,
        labels: labelsFor(axes, null),
        candidates,
      },
      cityMedianPpsf,
      listingPpsf,
    )
  }

  return applyTownMedianToLocationEstimate(
    {
      algoVersion: LOCATION_ESTIMATE_ALGO_VERSION,
      kind: picked.axis,
      axis: picked.axis,
      geometry: geometryForKind(picked.axis),
      coastalStrip:
        picked.axis === 'coastal' && axes.coastal
          ? coastalStripInfo(axes.coastal.inlandMiles)
          : null,
      soldCount: picked.soldCount,
      soldMedianPpsf: picked.soldMedianPpsf,
      cityMedianPpsf: null,
      listingPpsf,
      soldPremiumPct: null,
      listingPremiumPct: null,
      explainsLocation: false,
      labels: labelsFor(axes, picked.axis),
      candidates,
    },
    cityMedianPpsf,
    listingPpsf,
  )
}

/**
 * Town-median comparison is applied at read time so the estimate cache can
 * store the estimate without depending on Goldilocks peer medians.
 */
export function applyTownMedianToLocationEstimate(
  land: LocationEstimate,
  cityMedianPpsf: number | null,
  listingPpsf: number | null,
): LocationEstimate {
  const kind = land.kind ?? land.axis
  const candidates = land.candidates.map((c) => ({
    ...c,
    soldPremiumPct: premiumPct(c.soldMedianPpsf, cityMedianPpsf) ?? 0,
  }))
  return {
    ...land,
    kind,
    axis: land.axis ?? land.kind,
    geometry: land.geometry ?? geometryForKind(kind),
    coastalStrip: land.coastalStrip ?? null,
    cityMedianPpsf,
    listingPpsf,
    soldPremiumPct: premiumPct(land.soldMedianPpsf, cityMedianPpsf),
    listingPremiumPct: premiumPct(listingPpsf, cityMedianPpsf),
    explainsLocation: locationEstimateExplains(
      listingPpsf,
      cityMedianPpsf,
      land.soldMedianPpsf,
      land.soldCount,
    ),
    candidates,
  }
}

/** Insight tail when the stretch itself trades at a premium. Null = no causal claim. */
export function formatLocationEstimateInsightTail(
  land: LocationEstimate | null | undefined,
): string | null {
  if (!land?.explainsLocation) return null
  const kind = land.kind ?? land.axis
  if (kind === 'coastal') {
    return 'in line with recent sales in this coastal area'
  }
  if (kind === 'town_center') {
    return 'in line with recent sales near the town center'
  }
  return null
}
