import { NextRequest, NextResponse } from 'next/server'
import { extractClientIp } from '@/lib/ipapi-geo'
import { resolveVisitorIpGeo } from '@/lib/visitor-ip-geo'
import { townFromPostal } from '@/lib/visitor-location'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOWN_COORDS: Record<string, [number, number]> = {
  Norwalk:       [41.1177, -73.4082],
  Westport:      [41.1415, -73.3579],
  Wilton:        [41.1951, -73.4368],
  Fairfield:     [41.1408, -73.2637],
  Weston:        [41.2001, -73.3835],
  'New Canaan':  [41.1468, -73.4950],
  Ridgefield:    [41.2815, -73.4982],
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestTown(lat: number, lon: number): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const [town, [tLat, tLon]] of Object.entries(TOWN_COORDS)) {
    const d = haversineMiles(lat, lon, tLat, tLon)
    if (d < bestDist) {
      bestDist = d
      best = town
    }
  }
  return bestDist <= 60 ? best : null
}

export async function GET(req: NextRequest) {
  const ip = extractClientIp(req.headers)
  const lookup = await resolveVisitorIpGeo(ip)
  const lat = lookup.latitude
  const lon = lookup.longitude
  const postal = lookup.postal
  const townFromCoords =
    lat != null && lon != null ? nearestTown(lat, lon) : null
  const town = townFromCoords ?? townFromPostal(postal)
  return NextResponse.json({
    town,
    lat,
    lon,
    postal,
  })
}
