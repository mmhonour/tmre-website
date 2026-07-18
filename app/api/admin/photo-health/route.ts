import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { photoBackendUsesR2 } from '@/lib/listing-photo-backend'
import {
  readPhotoColdGapStats,
  readPhotoProxyHealthCounters,
  resetPhotoProxyHealthCounters,
} from '@/lib/listing-photo-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/photo-health — short-lived cold-gap + proxy counters. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const coldGap = await readPhotoColdGapStats(8)
    const proxy = readPhotoProxyHealthCounters()
    return NextResponse.json({
      backend: photoBackendUsesR2() ? 'r2' : 'sqlite',
      coldGap,
      proxy,
    })
  } catch (err) {
    console.error('[/api/admin/photo-health]', err)
    return NextResponse.json(
      { error: 'Failed to load photo health' },
      { status: 500 },
    )
  }
}

/** DELETE /api/admin/photo-health — reset the 24h proxy counter window. */
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await resetPhotoProxyHealthCounters()
    return NextResponse.json({
      ok: true,
      proxy: readPhotoProxyHealthCounters(),
    })
  } catch (err) {
    console.error('[/api/admin/photo-health DELETE]', err)
    return NextResponse.json(
      { error: 'Failed to reset photo health counters' },
      { status: 500 },
    )
  }
}
