import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getListingPhotoTtlMinutes,
  LISTING_PHOTO_TTL_MINUTES_DEFAULT,
  LISTING_PHOTO_TTL_MINUTES_MAX,
  LISTING_PHOTO_TTL_MINUTES_MIN,
  setListingPhotoTtlMinutes,
} from '@/lib/listing-photo-ttl-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function payload() {
  return {
    ttlMinutes: getListingPhotoTtlMinutes(),
    default: LISTING_PHOTO_TTL_MINUTES_DEFAULT,
    min: LISTING_PHOTO_TTL_MINUTES_MIN,
    max: LISTING_PHOTO_TTL_MINUTES_MAX,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(payload())
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

  const raw = (body as { ttlMinutes?: unknown })?.ttlMinutes
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: 'ttlMinutes must be a number' }, { status: 400 })
  }

  const applied = await setListingPhotoTtlMinutes(value)
  return NextResponse.json({ ok: true, ...payload(), ttlMinutes: applied })
}
