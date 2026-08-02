import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  normalizeSpotlightTabOrder,
  readSpotlightTabOrderFresh,
  spotlightTabOrderVersion,
  writeSpotlightTabOrder,
} from '@/lib/spotlight-tab-order'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Admin: current Spotlight display order (stable slot ids). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const payload = await readSpotlightTabOrderFresh()
  return NextResponse.json({
    order: payload.order,
    updatedAt: payload.updatedAt,
    version: spotlightTabOrderVersion(payload),
  })
}

/** Admin: save display order only — does not swap MLS between slot numbers. */
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

  const rawOrder = (body as { order?: unknown })?.order
  if (!Array.isArray(rawOrder)) {
    return NextResponse.json(
      { error: 'order must be an array of slot numbers (e.g. [5,1,2,3,4])' },
      { status: 400 },
    )
  }

  const order = normalizeSpotlightTabOrder(rawOrder)
  const payload = await writeSpotlightTabOrder(order)

  return NextResponse.json({
    ok: true,
    order: payload.order,
    updatedAt: payload.updatedAt,
    version: spotlightTabOrderVersion(payload),
    note: 'Order saved · public rail will pick this up on the next poll (~15–20s). Slot MLS / privacy unchanged.',
  })
}
