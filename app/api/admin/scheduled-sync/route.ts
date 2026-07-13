import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  isScheduledSyncPausedFresh,
  setScheduledSyncPaused,
} from '@/lib/scheduled-sync-toggle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ paused: await isScheduledSyncPausedFresh() })
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

  const raw = (body as { paused?: unknown })?.paused
  if (typeof raw !== 'boolean') {
    return NextResponse.json({ error: 'paused must be a boolean' }, { status: 400 })
  }

  const paused = await setScheduledSyncPaused(raw)
  return NextResponse.json({ ok: true, paused })
}
