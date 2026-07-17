import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getScheduledSyncPausedJobsFresh,
  isScheduledSyncJobId,
  setScheduledSyncJobPaused,
  setScheduledSyncPaused,
  type ScheduledSyncJobId,
} from '@/lib/scheduled-sync-toggle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jobs = await getScheduledSyncPausedJobsFresh()
  return NextResponse.json({ jobs, paused: Object.values(jobs).every(Boolean) })
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

  const raw = body as { jobId?: unknown; paused?: unknown }

  // Per-job pause (admin table PAUSE column).
  if (typeof raw.jobId === 'string') {
    if (!isScheduledSyncJobId(raw.jobId)) {
      return NextResponse.json({ error: 'Unknown jobId' }, { status: 400 })
    }
    if (typeof raw.paused !== 'boolean') {
      return NextResponse.json({ error: 'paused must be a boolean' }, { status: 400 })
    }
    const jobs = await setScheduledSyncJobPaused(
      raw.jobId as ScheduledSyncJobId,
      raw.paused,
    )
    return NextResponse.json({
      ok: true,
      jobId: raw.jobId,
      paused: jobs[raw.jobId as ScheduledSyncJobId],
      jobs,
    })
  }

  // Legacy: pause/unpause every job at once.
  if (typeof raw.paused === 'boolean') {
    const paused = await setScheduledSyncPaused(raw.paused)
    const jobs = await getScheduledSyncPausedJobsFresh()
    return NextResponse.json({ ok: true, paused, jobs })
  }

  return NextResponse.json(
    { error: 'Provide { jobId, paused } or { paused }' },
    { status: 400 },
  )
}
