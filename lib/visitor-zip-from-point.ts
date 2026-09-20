import 'server-only'

import { getZipBoundaryRings } from '@/lib/zip-boundary-cache'
import { townFromPostal } from '@/lib/visitor-location'
import {
  censusZctaFromGeographiesJson,
  zipFromRingsAtPoint,
} from '@/lib/visitor-wifi-zip-shared'
import { zipsForAllTowns } from '@/lib/tmre-towns'

const CENSUS_COORD_GEOGRAPHIES =
  'https://geocoding.geo.census.gov/geocoder/geographies/coordinates'
const CENSUS_TIMEOUT_MS = 4_000

export type VisitorZipFromPoint = {
  postal: string | null
  town: string | null
  source: 'tmre-zcta' | 'census' | null
}

function finiteCoord(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

export function parseVisitorPointBody(body: unknown): {
  latitude: number
  longitude: number
} | null {
  if (!body || typeof body !== 'object') return null
  const rec = body as { latitude?: unknown; longitude?: unknown }
  const latitude = finiteCoord(rec.latitude, -90, 90)
  const longitude = finiteCoord(rec.longitude, -180, 180)
  if (latitude == null || longitude == null) return null
  if (latitude === 0 && longitude === 0) return null
  return { latitude, longitude }
}

async function censusZctaAtPoint(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const url = new URL(CENSUS_COORD_GEOGRAPHIES)
  url.searchParams.set('x', String(longitude))
  url.searchParams.set('y', String(latitude))
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Current_Current')
  url.searchParams.set('format', 'json')
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'tmre-website/visitor-wifi-zip',
      },
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    return censusZctaFromGeographiesJson(json)
  } catch {
    return null
  }
}

/** Wi-Fi / GPS coordinates → ZIP. TMRE ZCTA rings first, Census if outside. */
export async function visitorZipFromPoint(
  latitude: number,
  longitude: number,
): Promise<VisitorZipFromPoint> {
  const { rings } = await getZipBoundaryRings(zipsForAllTowns(), {
    fetchMissing: false,
  })
  const fromRings = zipFromRingsAtPoint(latitude, longitude, rings)
  if (fromRings) {
    return {
      postal: fromRings,
      town: townFromPostal(fromRings),
      source: 'tmre-zcta',
    }
  }
  const fromCensus = await censusZctaAtPoint(latitude, longitude)
  if (fromCensus) {
    return {
      postal: fromCensus,
      town: townFromPostal(fromCensus),
      source: 'census',
    }
  }
  return { postal: null, town: null, source: null }
}
