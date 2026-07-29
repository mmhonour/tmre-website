import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import { isScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  isSyncScheduleFrequencyId,
  normalizeStartTimeEt,
  readSyncScheduleConfigFresh,
  writeSyncScheduleConfig,
  type SyncScheduleConfig,
} from '@/lib/sync-schedule-config'
import { buildAdminSyncNextRuns } from '@/lib/admin-sync-schedule'
import { readListingsDbStats } from '@/lib/db/listings-repo'
import { getSyncMeta } from '@/lib/db/sync-meta-store'
import { readListingsRefreshStatus } from '@/lib/listings-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function nextRunsWith(config: SyncScheduleConfig) {
  const stats = await readListingsDbStats()
  const refresh = readListingsRefreshStatus()
  return buildAdminSyncNextRuns(
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
    config,
  )
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await hydrateSyncMetaStore()
  const scheduleConfig = await readSyncScheduleConfigFresh()
  return NextResponse.json({
    scheduleConfig,
    nextRuns: await nextRunsWith(scheduleConfig),
  })
}

/**
 * PATCH body (one of):
 *   { jobId, frequency }
 *   { jobId, startTimeEt: "HH:MM" }
 *   { order: ScheduledSyncJobId[] }
 *   { moveJobId, direction: "up" | "down" }
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
    frequency?: unknown
    startTimeEt?: unknown
    order?: unknown
    moveJobId?: unknown
    direction?: unknown
  }

  await hydrateSyncMetaStore()
  let config = await readSyncScheduleConfigFresh()

  if (Array.isArray(raw.order)) {
    config = await writeSyncScheduleConfig({ ...config, order: raw.order as SyncScheduleConfig['order'] })
  } else if (
    typeof raw.moveJobId === 'string' &&
    isScheduledSyncJobId(raw.moveJobId) &&
    (raw.direction === 'up' || raw.direction === 'down')
  ) {
    const order = config.order.slice()
    const idx = order.indexOf(raw.moveJobId)
    if (idx < 0) {
      return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
    }
    const swapWith = raw.direction === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= order.length) {
      return NextResponse.json({
        ok: true,
        scheduleConfig: config,
        nextRuns: await nextRunsWith(config),
      })
    }
    ;[order[idx], order[swapWith]] = [order[swapWith]!, order[idx]!]
    config = await writeSyncScheduleConfig({ ...config, order })
  } else if (typeof raw.jobId === 'string' && isScheduledSyncJobId(raw.jobId)) {
    const job = { ...config.jobs[raw.jobId] }
    if (typeof raw.frequency === 'string') {
      if (!isSyncScheduleFrequencyId(raw.frequency)) {
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 })
      }
      job.frequency = raw.frequency
    }
    if (typeof raw.startTimeEt === 'string') {
      const normalized = normalizeStartTimeEt(raw.startTimeEt)
      if (!normalized) {
        return NextResponse.json(
          { error: 'startTimeEt must be HH:MM' },
          { status: 400 },
        )
      }
      job.startTimeEt = normalized
    }
    if (raw.frequency == null && raw.startTimeEt == null) {
      return NextResponse.json(
        { error: 'Provide frequency and/or startTimeEt' },
        { status: 400 },
      )
    }
    config = await writeSyncScheduleConfig({
      ...config,
      jobs: { ...config.jobs, [raw.jobId]: job },
    })
  } else {
    return NextResponse.json(
      {
        error:
          'Provide { jobId, frequency|startTimeEt }, { order }, or { moveJobId, direction }',
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    scheduleConfig: config,
    nextRuns: await nextRunsWith(config),
  })
}
