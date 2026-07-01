import { NextRequest, NextResponse } from 'next/server'
import { townFromPostal } from '@/lib/visitor-location'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Approximate centroids for each supported town
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
  // Only personalize if visitor is within ~60 miles of Fairfield County
  return bestDist <= 60 ? best : null
}

export async function GET(req: NextRequest) {
  // Resolve client IP
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') ?? null

  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return NextResponse.json({ town: null, postal: null })
  }

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'tmre-website/0.1' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`ipapi status ${res.status}`)
    const data = (await res.json()) as { latitude?: unknown; longitude?: unknown; postal?: unknown }
    const lat = Number(data.latitude)
    const lon = Number(data.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('no coords')
    const town =
      nearestTown(lat, lon) ??
      townFromPostal(typeof data.postal === 'string' ? data.postal : null)
    const postal =
      typeof data.postal === 'string' && data.postal.trim()
        ? data.postal.trim().slice(0, 5)
        : null
    return NextResponse.json({ town, lat, lon, postal })
  } catch {
    return NextResponse.json({ town: null, postal: null })
  }
}
