import { pointInRings } from '@/lib/location-estimate-zip-grid-shared'
import { normalizeZip, townForZip } from '@/lib/tmre-towns'

/** IP postal is the ISP block (e.g. unique 06858), not a TMRE town ZIP. */
export function ipPostalNeedsWifiRefine(
  postal: string | null | undefined,
): boolean {
  return townForZip(postal) == null
}

export function zipFromRingsAtPoint(
  latitude: number,
  longitude: number,
  ringsByZip: Iterable<
    readonly [string, readonly (readonly [number, number][])[]]
  >,
): string | null {
  for (const [zip, rings] of ringsByZip) {
    if (pointInRings(longitude, latitude, rings)) {
      return normalizeZip(zip)
    }
  }
  return null
}

/** Census `geographies/coordinates` JSON → 5-digit ZCTA. */
export function censusZctaFromGeographiesJson(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const result = (json as { result?: { geographies?: unknown } }).result
  const geos = result?.geographies
  if (!geos || typeof geos !== 'object') return null
  const record = geos as Record<string, unknown>
  const key = Object.keys(record).find((name) =>
    /zip code tabulation|zcta/i.test(name),
  )
  if (!key) return null
  const rows = record[key]
  if (!Array.isArray(rows) || rows.length === 0) return null
  const first = rows[0]
  if (!first || typeof first !== 'object') return null
  const row = first as Record<string, unknown>
  const raw = row.GEOID ?? row.ZCTA5CE20 ?? row.ZCTA5 ?? row.BASENAME
  return normalizeZip(typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null)
}
