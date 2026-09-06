import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getLocationEstimateTownCentersFresh,
  resetLocationEstimateTownCenter,
  setLocationEstimateTownCenter,
} from '@/lib/location-estimate-town-centers-config'
import {
  parseTownCenterPlacement,
} from '@/lib/location-estimate-town-centers-shared'
import { isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const payload = await getLocationEstimateTownCentersFresh()
  return NextResponse.json(payload)
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

  const raw = body as { town?: unknown; reset?: unknown }
  if (typeof raw.town !== 'string' || !isTmreTown(raw.town)) {
    return NextResponse.json({ error: 'town must be a TMRE town' }, { status: 400 })
  }

  if (raw.reset === true) {
    const payload = await resetLocationEstimateTownCenter(raw.town)
    return NextResponse.json({ ok: true, ...payload })
  }

  const placement = parseTownCenterPlacement(body)
  if (!placement) {
    return NextResponse.json(
      { error: 'Provide lat, lon, and optional radiusMiles' },
      { status: 400 },
    )
  }

  const payload = await setLocationEstimateTownCenter(raw.town, placement)
  return NextResponse.json({ ok: true, ...payload })
}
