/**
 * Census TIGERweb — ZIP Code Tabulation Area (ZCTA) geometry for TMRE maps.
 *
 * ## Internet location
 * Service root (ArcGIS MapServer):
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer
 *
 * Layer used here: **1** = 2020 Census ZIP Code Tabulation Areas
 *
 * ## Query mechanism
 * REST `query` on that layer with:
 *   - `where=ZCTA5='06880'` (5-digit ZIP / ZCTA)
 *   - `outFields=ZCTA5`
 *   - `returnGeometry=true`
 *   - `f=geojson`
 *   - `outSR=4326` (WGS84 lon/lat for SVG projection)
 *
 * Example:
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query?where=ZCTA5%3D'06880'&outFields=ZCTA5&returnGeometry=true&f=geojson&outSR=4326
 *
 * Geometry is Polygon or MultiPolygon; we keep the **outer ring** of each
 * polygon for the Intelligence / Latest SVG popovers.
 *
 * Boundaries change rarely → stored in Postgres `zip_boundaries` and refreshed
 * by the monthly Netlify function `sync-zip-boundaries` (or Admin Syncs Overview).
 */

export type ZipBoundaryRing = [number, number][]

export const TIGERWEB_ZCTA_MAPSERVER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer'

/** 2020 Census ZIP Code Tabulation Areas layer index. */
export const TIGERWEB_ZCTA_LAYER = 1

export const TIGERWEB_ZCTA_SOURCE = 'tigerweb-zcta-2020'

export function tigerwebZctaQueryUrl(zip: string): string {
  return (
    `${TIGERWEB_ZCTA_MAPSERVER}/${TIGERWEB_ZCTA_LAYER}/query` +
    `?where=ZCTA5%3D'${encodeURIComponent(zip)}'` +
    `&outFields=ZCTA5&returnGeometry=true&f=geojson&outSR=4326`
  )
}

/** Fetch + parse outer rings from Census TIGERweb (network). */
export async function fetchTigerwebZctaRings(zip: string): Promise<ZipBoundaryRing[]> {
  const res = await fetch(tigerwebZctaQueryUrl(zip), {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`TIGERweb HTTP ${res.status} for ${zip}`)
  const data = (await res.json()) as {
    error?: { message?: string }
    features?: { geometry: { type: string; coordinates: unknown } }[]
  }
  if (data.error) throw new Error(data.error.message ?? 'TIGERweb query failed')

  const rings: ZipBoundaryRing[] = []
  for (const feature of data.features ?? []) {
    const { type, coordinates } = feature.geometry
    if (type === 'Polygon') {
      rings.push((coordinates as ZipBoundaryRing[])[0])
    } else if (type === 'MultiPolygon') {
      for (const poly of coordinates as ZipBoundaryRing[][]) {
        rings.push(poly[0])
      }
    }
  }
  if (rings.length === 0) throw new Error(`No TIGERweb geometry for ${zip}`)
  return rings
}
