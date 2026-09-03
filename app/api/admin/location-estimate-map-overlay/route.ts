import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getLocationEstimateMapOverlayFresh,
  setLocationEstimateMapOverlay,
} from '@/lib/location-estimate-map-overlay-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const enabled = await getLocationEstimateMapOverlayFresh()
  return NextResponse.json({ enabled })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const enabled = (body as { enabled?: unknown })?.enabled
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }

  const applied = await setLocationEstimateMapOverlay(enabled)
  return NextResponse.json({ ok: true, enabled: applied })
}
