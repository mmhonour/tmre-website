import type { TmreTown } from '@/lib/tmre-towns'
import {
  resolveAllTownCenters,
  townCenterOwningAt,
  type TownCenterPlacements,
} from '@/lib/location-estimate-town-centers-shared'
import {
  TOWN_CENTER_RADIUS_MILES,
  cellCenter,
  cellKey,
  cellRing,
  coastalStripLabel,
  parseCellKey,
  type ZipGridCells,
} from '@/lib/location-estimate-zip-grid-shared'

export { TOWN_CENTER_RADIUS_MILES } from '@/lib/location-estimate-zip-grid-shared'

export type LocationEstimateOverlayKind = 'town_center' | 'coastal_strip'

export type LocationEstimateOverlayRing = {
  id: string
  kind: LocationEstimateOverlayKind
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
const MILES_PER_DEG_LAT = 69.172

function offsetLatLon(
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

/** One disk per TMRE town — not a disk per zip. */
export function townCenterOverlayShapes(
  placements: TownCenterPlacements = {},
): {
  rings: LocationEstimateOverlayRing[]
  dots: LocationEstimateOverlayDot[]
} {
  const rings: LocationEstimateOverlayRing[] = []
  const dots: LocationEstimateOverlayDot[] = []
  for (const [town, pt] of Object.entries(resolveAllTownCenters(placements)) as [
    TmreTown,
    { lat: number; lon: number; radiusMiles: number },
  ][]) {
    rings.push({
      id: `center-${town}`,
      kind: 'town_center',
      ring: circleRing(pt.lat, pt.lon, pt.radiusMiles),
      label: town,
    })
    dots.push({
      id: `dot-${town}`,
      lat: pt.lat,
      lon: pt.lon,
      label: town,
    })
  }
  return { rings, dots }
}

/**
 * Painted coastal cells. Squares whose center sits inside a town-center
 * radius are dropped — that disk overrides the grid.
 */
export function paintedGridOverlayRings(
  cells: ZipGridCells,
  placements: TownCenterPlacements = {},
): LocationEstimateOverlayRing[] {
  const rings: LocationEstimateOverlayRing[] = []
  for (const [key, strip] of Object.entries(cells)) {
    const parsed = parseCellKey(key)
    if (!parsed) continue
    const center = cellCenter(parsed.i, parsed.j)
    if (townCenterOwningAt(center.lat, center.lon, placements)) continue
    rings.push({
      id: `cell-${key}`,
      kind: 'coastal_strip',
      ring: cellRing(parsed.i, parsed.j),
      stripIndex: strip,
      label: coastalStripLabel(strip),
    })
  }
  return rings
}

export function locationEstimateOverlayShapes(
  cells: ZipGridCells = {},
  placements: TownCenterPlacements = {},
): {
  rings: LocationEstimateOverlayRing[]
  dots: LocationEstimateOverlayDot[]
} {
  const towns = townCenterOverlayShapes(placements)
  return {
    rings: [...towns.rings, ...paintedGridOverlayRings(cells, placements)],
    dots: towns.dots,
  }
}

export function cellId(i: number, j: number): string {
  return cellKey(i, j)
}
