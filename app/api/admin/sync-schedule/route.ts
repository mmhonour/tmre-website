import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import { updateMarketDigestSchedule } from '@/lib/market-digest-schedule'
import { isScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  isSyncScheduleFrequencyId,
  isSyncScheduleWeekdayEt,
  normalizeStartTimeEt,
  readSyncScheduleConfigFresh,
  writeSyncScheduleConfig,
  type SyncScheduleConfig,
} from '@/lib/sync-schedule-config'
import {
  clampJobBudgetMinutes,
  SYNC_JOB_BUDGET_MAX_MINUTES,
  SYNC_JOB_BUDGET_MIN_MINUTES,
} from '@/lib/sync-queue-shared'
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
 *   { jobId, weekdayEt: 0-6 }  // weekly send day (ET)
 *   { jobId, budgetMinutes: number }  // runner kills the child at this deadline
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
    weekdayEt?: unknown
    budgetMinutes?: unknown
    order?: unknown
    moveJobId?: unknown
    direction?: unknown
  }

  await hydrateSyncMetaStore()
  let config = await readSyncScheduleConfigFresh()

  if (Array.isArray(raw.order)) {
    config = await writeSyncScheduleConfig({
      ...config,
      order: raw.order as SyncScheduleConfig['order'],
    })
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
    const hasFrequency = typeof raw.frequency === 'string'
    const hasStart = typeof raw.startTimeEt === 'string'
    const hasWeekday = raw.weekdayEt !== undefined && raw.weekdayEt !== null
    const hasBudget = raw.budgetMinutes !== undefined && raw.budgetMinutes !== null

    if (!hasFrequency && !hasStart && !hasWeekday && !hasBudget) {
      return NextResponse.json(
        {
          error:
            'Provide frequency, startTimeEt, weekdayEt, and/or budgetMinutes',
        },
        { status: 400 },
      )
    }

    if (hasBudget) {
      const minutes = Number(raw.budgetMinutes)
      if (!Number.isFinite(minutes) || minutes < SYNC_JOB_BUDGET_MIN_MINUTES) {
        return NextResponse.json(
          {
            error: `budgetMinutes must be ${SYNC_JOB_BUDGET_MIN_MINUTES}–${SYNC_JOB_BUDGET_MAX_MINUTES} minutes`,
          },
          { status: 400 },
        )
      }
    }

    if (hasWeekday) {
      const wd = Number(raw.weekdayEt)
      if (!isSyncScheduleWeekdayEt(wd)) {
        return NextResponse.json(
          { error: 'weekdayEt must be 0–6 (Sun–Sat)' },
          { status: 400 },
        )
      }
    }

    // Market digest day/time lives on sync_schedule_config and also rewrites
    // the email subject day name when weekday changes.
    if (raw.jobId === 'market-digest' && (hasWeekday || hasStart)) {
      try {
        const wd = hasWeekday ? Number(raw.weekdayEt) : undefined
        config = await updateMarketDigestSchedule({
          ...(isSyncScheduleWeekdayEt(wd) ? { weekdayEt: wd } : {}),
          ...(hasStart ? { startTimeEt: String(raw.startTimeEt) } : {}),
        })
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid schedule' },
          { status: 400 },
        )
      }
    }

    if (
      hasFrequency ||
      hasBudget ||
      (raw.jobId !== 'market-digest' && (hasStart || hasWeekday))
    ) {
      const job = { ...config.jobs[raw.jobId] }
      if (hasFrequency) {
        if (!isSyncScheduleFrequencyId(String(raw.frequency))) {
          return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 })
        }
        job.frequency = raw.frequency as typeof job.frequency
      }
      if (hasBudget) {
        job.budgetMinutes = clampJobBudgetMinutes(Number(raw.budgetMinutes))
      }
      if (raw.jobId !== 'market-digest') {
        if (hasStart) {
          const normalized = normalizeStartTimeEt(String(raw.startTimeEt))
          if (!normalized) {
            return NextResponse.json(
              { error: 'startTimeEt must be HH:MM' },
              { status: 400 },
            )
          }
          job.startTimeEt = normalized
        }
        if (hasWeekday) {
          job.weekdayEt = Number(raw.weekdayEt) as typeof job.weekdayEt
        }
      }
      config = await writeSyncScheduleConfig({
        ...config,
        jobs: { ...config.jobs, [raw.jobId]: job },
      })
    }
  } else {
    return NextResponse.json(
      {
        error:
          'Provide { jobId, frequency|startTimeEt|weekdayEt|budgetMinutes }, { order }, or { moveJobId, direction }',
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
