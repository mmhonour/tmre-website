import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  deleteSavedSearchAlert,
  listSavedSearchAlertsForAdmin,
  setSavedSearchAlertActive,
} from '@/lib/saved-search-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limitRaw = req.nextUrl.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : 200

  try {
    const alerts = await listSavedSearchAlertsForAdmin(
      Number.isFinite(limit) ? limit : 200,
    )
    const duplicateCount = alerts.filter((a) => a.isDuplicate).length
    return NextResponse.json({
      ok: true,
      count: alerts.length,
      duplicateCount,
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

/**
 * PATCH body: { id: string, active: boolean }
 */
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

  const raw = body as { id?: unknown; active?: unknown }
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id || typeof raw.active !== 'boolean') {
    return NextResponse.json(
      { error: 'Provide { id, active }' },
      { status: 400 },
    )
  }
  const active = raw.active

  try {
    const ok = await setSavedSearchAlertActive(id, active)
    if (!ok) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }
    const alerts = await listSavedSearchAlertsForAdmin(200)
    return NextResponse.json({
      ok: true,
      alert: alerts.find((a) => a.id === id) ?? null,
      count: alerts.length,
      duplicateCount: alerts.filter((a) => a.isDuplicate).length,
      alerts,
    })
  } catch (err) {
    console.error('[admin/saved-search-alerts] PATCH failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    )
  }
}

/**
 * DELETE body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body as { id?: unknown }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    return NextResponse.json({ error: 'Provide { id }' }, { status: 400 })
  }

  try {
    const ok = await deleteSavedSearchAlert(raw.id)
    if (!ok) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }
    const alerts = await listSavedSearchAlertsForAdmin(200)
    return NextResponse.json({
      ok: true,
      deletedId: raw.id.trim(),
      count: alerts.length,
      duplicateCount: alerts.filter((a) => a.isDuplicate).length,
      alerts,
    })
  } catch (err) {
    console.error('[admin/saved-search-alerts] DELETE failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 },
    )
  }
}
