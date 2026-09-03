import {
  COASTAL_INLAND_MAX_MILES,
  COASTAL_STRIP_WIDTH_MILES,
  LOCATION_STRETCH_LENGTH_MILES,
  TOWN_CENTER_RADIUS_MILES,
  coastalStripIndex,
  offsetLatLon,
  perpendicularAxis,
  unitOffset,
  type AxisUnit,
} from '@/lib/listing-location-estimates'
import { TOWN_CENTERS, WATER_ACCESS_POINTS, ZIP_CENTERS } from '@/lib/tmre-geo'

export type LocationEstimateOverlayKind = 'town_center' | 'coastal_strip'

export type LocationEstimateOverlayRing = {
  id: string
  kind: LocationEstimateOverlayKind
  /** Closed [lon, lat] ring for DealBoardMap's Web-Mercator path helper. */
  ring: [number, number][]
  stripIndex?: number
  label: string
}

export type LocationEstimateOverlayDot = {
  id: string
  lat: number
  lon: number
  label: string
}

const CIRCLE_STEPS = 48
const DEDUPE_MILES = 0.04

function circleRing(
  lat: number,
  lon: number,
  radiusMiles: number,
): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= CIRCLE_STEPS; i++) {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2
    const p = offsetLatLon(
      lat,
      lon,
      Math.cos(a) * radiusMiles,
      Math.sin(a) * radiusMiles,
    )
    ring.push([p.lon, p.lat])
  }
  return ring
}

function rectangleRing(
  originLat: number,
  originLon: number,
  along: AxisUnit,
  inland: AxisUnit,
  alongHalf: number,
  inland0: number,
  inland1: number,
): [number, number][] {
  const corners = [
    { along: -alongHalf, inland: inland0 },
    { along: alongHalf, inland: inland0 },
    { along: alongHalf, inland: inland1 },
    { along: -alongHalf, inland: inland1 },
    { along: -alongHalf, inland: inland0 },
  ]
  return corners.map(({ along: a, inland: n }) => {
    const p = offsetLatLon(
      originLat,
      originLon,
      along.east * a + inland.east * n,
      along.north * a + inland.north * n,
    )
    return [p.lon, p.lat]
  })
}

function inlandAxisFromWater(lat: number, lon: number): AxisUnit {
  let best: { east: number; north: number; len: number } | null = null
  for (const pt of Object.values(TOWN_CENTERS)) {
    const east =
      (pt.lon - lon) * Math.cos((lat * Math.PI) / 180) * 69.172
    const north = (pt.lat - lat) * 69.172
    const len = Math.hypot(east, north)
    if (!best || len < best.len) best = { east, north, len }
  }
  return unitOffset(best?.east ?? 0, best?.north ?? 1) ?? { east: 0, north: 1 }
}

function uniqueCenters(): { id: string; label: string; lat: number; lon: number }[] {
  const out: { id: string; label: string; lat: number; lon: number }[] = []
  const consider = (
    id: string,
    label: string,
    lat: number,
    lon: number,
  ) => {
    const dup = out.some((c) => {
      const east =
        (c.lon - lon) * Math.cos((lat * Math.PI) / 180) * 69.172
      const north = (c.lat - lat) * 69.172
      return Math.hypot(east, north) < DEDUPE_MILES
    })
    if (!dup) out.push({ id, label, lat, lon })
  }
  for (const [zip, pt] of Object.entries(ZIP_CENTERS)) {
    consider(`zip-${zip}`, zip, pt.lat, pt.lon)
  }
  for (const [town, pt] of Object.entries(TOWN_CENTERS)) {
    consider(`town-${town}`, town, pt.lat, pt.lon)
  }
  return out
}

function buildOverlay(): {
  rings: LocationEstimateOverlayRing[]
  dots: LocationEstimateOverlayDot[]
} {
  const rings: LocationEstimateOverlayRing[] = []
  const dots: LocationEstimateOverlayDot[] = []
  const alongHalf = LOCATION_STRETCH_LENGTH_MILES / 2
  const stripCount = Math.round(COASTAL_INLAND_MAX_MILES / COASTAL_STRIP_WIDTH_MILES)

  for (const center of uniqueCenters()) {
    rings.push({
      id: `center-${center.id}`,
      kind: 'town_center',
      ring: circleRing(center.lat, center.lon, TOWN_CENTER_RADIUS_MILES),
      label: center.label,
    })
    dots.push({
      id: `dot-${center.id}`,
      lat: center.lat,
      lon: center.lon,
      label: center.label,
    })
  }

  WATER_ACCESS_POINTS.forEach((water, wi) => {
    const inland = inlandAxisFromWater(water.lat, water.lon)
    const along = perpendicularAxis(inland)
    for (let i = 0; i < stripCount; i++) {
      const inland0 = i * COASTAL_STRIP_WIDTH_MILES
      const inland1 = inland0 + COASTAL_STRIP_WIDTH_MILES
      const index = coastalStripIndex(inland0 + 0.01) ?? i
      rings.push({
        id: `strip-${wi}-${i}`,
        kind: 'coastal_strip',
        ring: rectangleRing(
          water.lat,
          water.lon,
          along,
          inland,
          alongHalf,
          inland0,
          inland1,
        ),
        stripIndex: index,
        label: `Coastal strip ${index}`,
      })
    }
  })

  return { rings, dots }
}

const CACHED = buildOverlay()

/** Fixed TMRE coastal-strip + town-center outlines. Safe to call on the client. */
export function locationEstimateOverlayShapes(): {
  rings: readonly LocationEstimateOverlayRing[]
  dots: readonly LocationEstimateOverlayDot[]
} {
  return CACHED
}
