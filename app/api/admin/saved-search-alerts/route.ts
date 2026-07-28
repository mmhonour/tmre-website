import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { listSavedSearchAlertsForAdmin } from '@/lib/saved-search-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limitRaw = req.nextUrl.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : 100

  try {
    const alerts = await listSavedSearchAlertsForAdmin(
      Number.isFinite(limit) ? limit : 100,
    )
    return NextResponse.json({
      ok: true,
      count: alerts.length,
      alerts,
    })
  } catch (err) {
    console.error('[admin/saved-search-alerts] list failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load alerts' },
      { status: 500 },
    )
  }
}
