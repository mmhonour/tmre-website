import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  isSyncNextOverrideJobId,
  nudgeSyncNextOverride,
  readSyncNextOverridesFresh,
  setSyncNextOverride,
} from '@/lib/sync-next-override'
import { buildAdminSyncNextRuns } from '@/lib/admin-sync-schedule'
import { readListingsDbStats } from '@/lib/db/listings-repo'
import { getSyncMeta } from '@/lib/db/sync-meta-store'
import { readListingsRefreshStatus } from '@/lib/listings-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function nextRunsPayload() {
  const stats = await readListingsDbStats()
  const refresh = readListingsRefreshStatus()
  const { readSyncScheduleConfig } = await import('@/lib/sync-schedule-config')
  const scheduleConfig = readSyncScheduleConfig()
  const nextRuns = buildAdminSyncNextRuns(
    {
      lastFullSyncStarted: stats.lastFullSyncStarted,
      lastFullSync: stats.lastFullSync,
      lastIncrementalSyncStarted: stats.lastIncrementalSyncStarted,
      lastIncrementalSync: stats.lastIncrementalSync,
      lastListingScoresStarted: stats.lastListingScoresStarted,
      lastListingScores: stats.lastListingScores,
      lastRefreshStarted: getSyncMeta('last_refresh_started_at'),
      lastRefreshFinished:
        getSyncMeta('last_refresh_finished_at') ?? refresh.lastFinishedAt,
      lastStatsCacheStarted: stats.lastStatsCacheStarted,
      lastStatsCache: stats.lastStatsCache,
      lastDealOfTheDayCacheStarted: stats.lastDealOfTheDayCacheStarted,
      lastDealOfTheDayCache: stats.lastDealOfTheDayCache,
    },
    new Date(),
    scheduleConfig,
  )
  const nextOverrides = await readSyncNextOverridesFresh()
  return { nextRuns, nextOverrides, scheduleConfig }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await nextRunsPayload())
}

/**
 * PATCH body:
 *   { jobId, steps: number, baseNextAt?: string } — nudge ± steps
 *   { jobId, nextAt: string | null } — set absolute ISO or clear
 *   { jobId, due: true } — set due now
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

  const raw = body as {
    jobId?: unknown
    steps?: unknown
    baseNextAt?: unknown
    nextAt?: unknown
    due?: unknown
  }

  if (typeof raw.jobId !== 'string' || !isSyncNextOverrideJobId(raw.jobId)) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  try {
    if (raw.due === true) {
      await setSyncNextOverride(raw.jobId, new Date().toISOString())
    } else if ('nextAt' in raw) {
      const nextAt =
        raw.nextAt === null || raw.nextAt === ''
          ? null
          : typeof raw.nextAt === 'string'
            ? raw.nextAt
            : null
      if (raw.nextAt != null && nextAt == null) {
        return NextResponse.json({ error: 'nextAt must be ISO string or null' }, { status: 400 })
      }
      await setSyncNextOverride(raw.jobId, nextAt)
    } else if (typeof raw.steps === 'number' && Number.isFinite(raw.steps)) {
      await nudgeSyncNextOverride({
        jobId: raw.jobId,
        baseNextAt: typeof raw.baseNextAt === 'string' ? raw.baseNextAt : null,
        steps: Math.trunc(raw.steps),
      })
    } else {
      return NextResponse.json(
        { error: 'Provide steps, nextAt, or due:true' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true, ...(await nextRunsPayload()) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }
}
