/**
 * Shared Web-Mercator helpers for `/api/map/tile` — same math as
 * DealBoardMap / ListingLocationMap. Admin CT coverage uses this so the
 * painter sits on the real street map, not a beige outline fill.
 */

export const MAP_TILE_SIZE = 256
export const MAP_MIN_ZOOM = 9
export const MAP_MAX_ZOOM = 17
export const MAP_FALLBACK_CENTER = { lat: 41.141, lon: -73.3579 }
export const MAP_FALLBACK_ZOOM = 11

export type MapLonLat = { lat: number; lon: number }
export type MapRing = [number, number][]
export type MapGeoBounds = {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export function mapTileUrl(z: number, x: number, y: number): string {
  return `/api/map/tile/${z}/${x}/${y}`
}

export function worldSize(zoom: number): number {
  return 2 ** zoom * MAP_TILE_SIZE
}

export function lonToWorldX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * worldSize(zoom)
}

export function latToWorldY(lat: number, zoom: number): number {
  const clamped = Math.max(-85, Math.min(85, lat))
  const rad = (clamped * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    worldSize(zoom)
  )
}

export function worldToLonLat(x: number, y: number, zoom: number): MapLonLat {
  const size = worldSize(zoom)
  const lon = (x / size) * 360 - 180
  const ny = 1 - (2 * y) / size
  const lat = (Math.atan(Math.sinh(Math.PI * ny)) * 180) / Math.PI
  return { lat, lon }
}

export function screenToLonLat(
  screenX: number,
  screenY: number,
  center: MapLonLat,
  zoom: number,
  size: { width: number; height: number },
): MapLonLat {
  const cx = lonToWorldX(center.lon, zoom) + (screenX - size.width / 2)
  const cy = latToWorldY(center.lat, zoom) + (screenY - size.height / 2)
  return worldToLonLat(cx, cy, zoom)
}

export function centerForAnchor(
  anchor: MapLonLat,
  screenX: number,
  screenY: number,
  zoom: number,
  size: { width: number; height: number },
): MapLonLat {
  const cx = lonToWorldX(anchor.lon, zoom) - (screenX - size.width / 2)
  const cy = latToWorldY(anchor.lat, zoom) - (screenY - size.height / 2)
  return worldToLonLat(cx, cy, zoom)
}

export function clampMapZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MAP_FALLBACK_ZOOM
  return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, zoom))
}

export function boundsFromRings(rings: readonly MapRing[]): MapGeoBounds | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  let any = false
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
      any = true
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }
  }
  return any ? { minLat, maxLat, minLon, maxLon } : null
}

export function fitMapBounds(
  bounds: MapGeoBounds | null,
  width: number,
  height: number,
  pad = 16,
): { center: MapLonLat; zoom: number } {
  if (!bounds || width <= 0 || height <= 0) {
    return { center: MAP_FALLBACK_CENTER, zoom: MAP_FALLBACK_ZOOM }
  }
  const availW = Math.max(32, width - pad * 2)
  const availH = Math.max(32, height - pad * 2)
  const spanX = lonToWorldX(bounds.maxLon, 0) - lonToWorldX(bounds.minLon, 0)
  const spanY = latToWorldY(bounds.minLat, 0) - latToWorldY(bounds.maxLat, 0)
  const zoomX = spanX > 0 ? Math.log2(availW / spanX) : MAP_MAX_ZOOM
  const zoomY = spanY > 0 ? Math.log2(availH / spanY) : MAP_MAX_ZOOM
  return {
    center: {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lon: (bounds.minLon + bounds.maxLon) / 2,
    },
    zoom: clampMapZoom(Math.min(zoomX, zoomY)),
  }
}

export function ringToMapPath(
  ring: MapRing,
  viewport: { left: number; top: number },
  zoom: number,
): string {
  if (ring.length < 3) return ''
  let d = ''
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]!
    const x = lonToWorldX(lon, zoom) - viewport.left
    const y = latToWorldY(lat, zoom) - viewport.top
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return `${d}Z`
}

export function tilesInViewport(args: {
  viewport: { left: number; top: number }
  zoom: number
  level: number
  width: number
  height: number
}): { key: string; src: string; left: number; top: number; size: number }[] {
  const { viewport, zoom, level, width, height } = args
  const n = 2 ** level
  const tilePx = MAP_TILE_SIZE * 2 ** (zoom - level)
  if (!Number.isFinite(tilePx) || tilePx <= 0) return []
  const firstCol = Math.floor(viewport.left / tilePx)
  const lastCol = Math.floor((viewport.left + width) / tilePx)
  const firstRow = Math.floor(viewport.top / tilePx)
  const lastRow = Math.floor((viewport.top + height) / tilePx)
  const out: { key: string; src: string; left: number; top: number; size: number }[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    if (row < 0 || row >= n) continue
    for (let col = firstCol; col <= lastCol; col++) {
      const x = ((col % n) + n) % n
      out.push({
        key: `${level}/${x}/${row}`,
        src: mapTileUrl(level, x, row),
        left: col * tilePx - viewport.left,
        top: row * tilePx - viewport.top,
        size: tilePx + 0.5,
      })
    }
  }
  return out
}
