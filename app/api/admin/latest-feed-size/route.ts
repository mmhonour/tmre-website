import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import {
  LATEST_FEED_SIZE_DEFAULT,
  LATEST_FEED_SIZE_MAX,
  LATEST_FEED_SIZE_MIN,
  getLatestFeedSizeFresh,
  setLatestFeedSize,
} from '@/lib/latest-feed-size-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return {
    size: await getLatestFeedSizeFresh(),
    default: LATEST_FEED_SIZE_DEFAULT,
    min: LATEST_FEED_SIZE_MIN,
    max: LATEST_FEED_SIZE_MAX,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await hydrateSyncMetaStore()
  return NextResponse.json(await payload())
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

  const raw = (body as { size?: unknown })?.size
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: 'size must be a number' }, { status: 400 })
  }

  await hydrateSyncMetaStore()
  const applied = await setLatestFeedSize(value)
  return NextResponse.json({ ok: true, ...(await payload()), size: applied })
}
