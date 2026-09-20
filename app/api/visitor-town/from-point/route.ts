import { NextRequest, NextResponse } from 'next/server'
import {
  parseVisitorPointBody,
  visitorZipFromPoint,
} from '@/lib/visitor-zip-from-point'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Browser geolocation (Wi-Fi on a laptop) → ZIP. */
export async function POST(req: NextRequest) {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const point = parseVisitorPointBody(body)
  if (!point) {
    return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 })
  }
  const found = await visitorZipFromPoint(point.latitude, point.longitude)
  return NextResponse.json({
    postal: found.postal,
    town: found.town,
    source: found.source,
  })
}
