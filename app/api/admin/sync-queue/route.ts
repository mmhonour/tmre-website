import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  cancelSyncQueueItem,
  clearSyncQueueForJob,
  readSyncQueueSnapshot,
} from '@/lib/sync-queue'
import { isSyncQueueRunnerJob } from '@/lib/sync-queue-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The waiting line, as Admin sees it.
 *
 * Dashboard already polls /api/admin/sync for clocks; this route exists so the
 * queue can be refreshed on its own cadence (and so Cancel / Clear have
 * somewhere to POST) without dragging a RETS probe along for the ride.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ queue: await readSyncQueueSnapshot() })
}

/**
 * POST body (one of):
 *   { action: "cancel", id }      — drop one waiting row
 *   { action: "clear", jobId }    — drop every waiting row for a job
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body as { action?: unknown; id?: unknown; jobId?: unknown }

  if (raw.action === 'cancel') {
    const id = Number(raw.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'id must be a queue row id' }, { status: 400 })
    }
    const result = await cancelSyncQueueItem(id)
    return NextResponse.json({
      ok: true,
      cancelled: result.cancelled,
      reason: result.reason,
      queue: await readSyncQueueSnapshot(),
    })
  }

  if (raw.action === 'clear') {
    const jobId = typeof raw.jobId === 'string' ? raw.jobId : ''
    if (!isSyncQueueRunnerJob(jobId)) {
      return NextResponse.json(
        { error: 'jobId must be a job the runner claims' },
        { status: 400 },
      )
    }
    const cleared = await clearSyncQueueForJob(jobId)
    return NextResponse.json({
      ok: true,
      cleared,
      queue: await readSyncQueueSnapshot(),
    })
  }

  return NextResponse.json(
    { error: 'Provide { action: "cancel", id } or { action: "clear", jobId }' },
    { status: 400 },
  )
}
