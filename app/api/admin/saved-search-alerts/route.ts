import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  deleteSavedSearchAlert,
  getAlertJobLastRuns,
  listSavedSearchAlertsForAdmin,
  processDueSavedSearchAlerts,
  setSavedSearchAlertActive,
} from '@/lib/saved-search-alerts'
import type { AlertJobKind } from '@/lib/saved-search-alert-kinds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Process due alerts now (catch-up). Does not ignore cadence unless force. */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let force = false
  let kind: AlertJobKind | 'both' = 'both'
  try {
    const body = (await req.json()) as { force?: unknown; kind?: unknown }
    force = body.force === true
    if (body.kind === 'listing' || body.kind === 'open_house') {
      kind = body.kind
    }
  } catch {
    force = false
  }

  try {
    const listing =
      kind === 'open_house'
        ? null
        : await processDueSavedSearchAlerts({
            kind: 'listing',
            source: 'admin',
            force,
          })
    const openHouse =
      kind === 'listing'
        ? null
        : await processDueSavedSearchAlerts({
            kind: 'open_house',
            source: 'admin',
            force,
          })
    const alerts = await listSavedSearchAlertsForAdmin(200)
    const lastRuns = await getAlertJobLastRuns()
    const checked = (listing?.checked ?? 0) + (openHouse?.checked ?? 0)
    const sent = (listing?.sent ?? 0) + (openHouse?.sent ?? 0)
    const listings = (listing?.listings ?? 0) + (openHouse?.listings ?? 0)
    const ok = (listing?.ok ?? true) && (openHouse?.ok ?? true)
    return NextResponse.json({
      ok,
      kind,
      listing,
      openHouse,
      checked,
      sent,
      listings,
      lastRuns,
      count: alerts.length,
      duplicateCount: alerts.filter((a) => a.isDuplicate).length,
      alerts,
    })
  } catch (err) {
    console.error('[admin/saved-search-alerts] POST failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Process failed' },
      { status: 502 },
    )
  }
}

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
    const lastRuns = await getAlertJobLastRuns()
    const duplicateCount = alerts.filter((a) => a.isDuplicate).length
    return NextResponse.json({
      ok: true,
      count: alerts.length,
      duplicateCount,
      lastRuns,
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
