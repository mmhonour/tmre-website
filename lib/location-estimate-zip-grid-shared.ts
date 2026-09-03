import { TOWN_CENTERS } from '@/lib/tmre-geo'
import type { TmreTown } from '@/lib/tmre-towns'

export const LOCATION_ESTIMATE_ZIP_GRID_KEY = 'location_estimate_zip_grid'
export const LOCATION_ESTIMATE_GRID_CHANGED_EVENT = 'tmre:location-estimate-grid'

export const GRID_CELL_MILES = 0.25
export const TOWN_CENTER_RADIUS_MILES = 0.25
export const COASTAL_STRIP_MAX_INDEX = 3

/** SW of TMRE coverage — cells are a global ¼-mile lattice. */
const GRID_ORIGIN = { lat: 40.95, lon: -73.75 }
const MILES_PER_DEG_LAT = 69.172

export type CoastalStripIndex = 0 | 1 | 2 | 3
export type ZipGridCells = Record<string, CoastalStripIndex>

export type ZipGridPayload = {
  version: 1
  cells: ZipGridCells
}

export function emptyZipGrid(): ZipGridPayload {
  return { version: 1, cells: {} }
}

export function isCoastalStripIndex(value: unknown): value is CoastalStripIndex {
  return value === 0 || value === 1 || value === 2 || value === 3
}

export function parseZipGridPayload(raw: string | null | undefined): ZipGridPayload {
  if (!raw) return emptyZipGrid()
  try {
    const parsed = JSON.parse(raw) as { cells?: unknown }
    const cells: ZipGridCells = {}
    if (parsed.cells && typeof parsed.cells === 'object') {
      for (const [key, value] of Object.entries(parsed.cells)) {
        if (isCellKey(key) && isCoastalStripIndex(value)) cells[key] = value
      }
    }
    return { version: 1, cells }
  } catch {
    return emptyZipGrid()
  }
}

export function cellKey(i: number, j: number): string {
  return `${i},${j}`
}

export function parseCellKey(key: string): { i: number; j: number } | null {
  const parts = key.split(',')
  if (parts.length !== 2) return null
  const i = Number(parts[0])
  const j = Number(parts[1])
  if (!Number.isInteger(i) || !Number.isInteger(j)) return null
  return { i, j }
}

export function isCellKey(key: string): boolean {
  return parseCellKey(key) != null
}

function originCos(): number {
  return Math.cos((GRID_ORIGIN.lat * Math.PI) / 180)
}

export function lonLatToCell(lat: number, lon: number): { i: number; j: number } {
  const east = (lon - GRID_ORIGIN.lon) * originCos() * MILES_PER_DEG_LAT
  const north = (lat - GRID_ORIGIN.lat) * MILES_PER_DEG_LAT
  return {
    i: Math.floor(east / GRID_CELL_MILES),
    j: Math.floor(north / GRID_CELL_MILES),
  }
}

export function cellCorner(
  i: number,
  j: number,
): { lat: number; lon: number } {
  const east = i * GRID_CELL_MILES
  const north = j * GRID_CELL_MILES
  return {
    lat: GRID_ORIGIN.lat + north / MILES_PER_DEG_LAT,
    lon: GRID_ORIGIN.lon + east / (MILES_PER_DEG_LAT * originCos()),
  }
}

export function cellCenter(i: number, j: number): { lat: number; lon: number } {
  return cellCorner(i + 0.5, j + 0.5)
}

/** Closed [lon, lat] ring for one ¼-mile cell. */
export function cellRing(i: number, j: number): [number, number][] {
  const sw = cellCorner(i, j)
  const se = cellCorner(i + 1, j)
  const ne = cellCorner(i + 1, j + 1)
  const nw = cellCorner(i, j + 1)
  return [
    [sw.lon, sw.lat],
    [se.lon, se.lat],
    [ne.lon, ne.lat],
    [nw.lon, nw.lat],
    [sw.lon, sw.lat],
  ]
}

export function milesBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const latRad = (a.lat * Math.PI) / 180
  const east = (b.lon - a.lon) * Math.cos(latRad) * MILES_PER_DEG_LAT
  const north = (b.lat - a.lat) * MILES_PER_DEG_LAT
  return Math.hypot(east, north)
}

export function townCenterOwning(
  lat: number,
  lon: number,
): TmreTown | null {
  let best: { town: TmreTown; miles: number } | null = null
  for (const [town, pt] of Object.entries(TOWN_CENTERS) as [TmreTown, { lat: number; lon: number }][]) {
    const miles = milesBetween(pt, { lat, lon })
    if (miles <= TOWN_CENTER_RADIUS_MILES && (!best || miles < best.miles)) {
      best = { town, miles }
    }
  }
  return best?.town ?? null
}

export function pointInRing(
  lon: number,
  lat: number,
  ring: readonly [number, number][],
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const crosses = yi > lat !== yj > lat
    if (
      crosses &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

export function pointInRings(
  lon: number,
  lat: number,
  rings: readonly (readonly [number, number][])[],
): boolean {
  return rings.some((ring) => ring.length >= 3 && pointInRing(lon, lat, ring))
}

export function cellsForZipRings(
  rings: readonly (readonly [number, number][])[],
): { i: number; j: number }[] {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  if (!Number.isFinite(minLon)) return []
  const sw = lonLatToCell(minLat, minLon)
  const ne = lonLatToCell(maxLat, maxLon)
  const out: { i: number; j: number }[] = []
  for (let i = sw.i; i <= ne.i; i++) {
    for (let j = sw.j; j <= ne.j; j++) {
      const c = cellCenter(i, j)
      if (pointInRings(c.lon, c.lat, rings)) out.push({ i, j })
    }
  }
  return out
}

/**
 * Mark ¼-mile cells stepping north from the town's south-facing edge.
 * A shore cell is occupied and its due-south neighbor is not — that is
 * water or out of this town, not the next zip inland. `paintWithin`
 * limits which cells are written (the zip on screen); occupancy still
 * uses the whole town so the 06825 / 06824 border is not treated as coast.
 */
export function suggestCoastalStrips(
  townOccupied: readonly { i: number; j: number }[],
  paintWithin: readonly { i: number; j: number }[] = townOccupied,
): ZipGridCells {
  const occupied = new Set(townOccupied.map((c) => cellKey(c.i, c.j)))
  const within = new Set(paintWithin.map((c) => cellKey(c.i, c.j)))
  const cells: ZipGridCells = {}
  for (const { i, j } of paintWithin) {
    if (occupied.has(cellKey(i, j - 1))) continue
    for (let n = 0; n <= COASTAL_STRIP_MAX_INDEX; n++) {
      const key = cellKey(i, j + n)
      if (!within.has(key) || !occupied.has(key)) break
      const existing = cells[key]
      if (existing == null || n < existing) {
        cells[key] = n as CoastalStripIndex
      }
    }
  }
  return cells
}

export function mergeZipGridPatch(
  current: ZipGridCells,
  patch: ZipGridCells,
  erase: readonly string[],
): ZipGridCells {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (isCellKey(key) && isCoastalStripIndex(value)) next[key] = value
  }
  for (const key of erase) {
    if (isCellKey(key)) delete next[key]
  }
  return next
}
