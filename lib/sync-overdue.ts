import 'server-only'

import { runAdminSyncAction } from '@/lib/admin-sync-actions'
import type { AdminSyncActionId } from '@/lib/admin-sync-types'
import {
  isIntervalSyncOverdue,
  isWeeklyMondaySyncOverdue,
  latestIntervalMs,
  parseIsoMs,
  statsRefreshIntervalMs,
} from '@/lib/admin-sync-schedule'
import { ZIP_BOUNDARIES_TTL_MS } from '@/lib/zip-boundary-cache'
import { deleteSyncMeta, getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { isRetsConfigured } from '@/lib/rets'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  getScheduledSyncPausedJobsFresh,
  isScheduledSyncPausedFresh,
  type ScheduledSyncJobId,
} from '@/lib/scheduled-sync-toggle'
import {
  isSyncNextOverrideDue,
  shouldDeferScheduledJob,
  type SyncNextOverrideJobId,
} from '@/lib/sync-next-override'

export type OverdueSyncJob = AdminSyncActionId | 'edge-scores'

export type OverdueSyncCatchupStep = {
  job: OverdueSyncJob
  ok: boolean
  message: string
  detail?: string
  durationMs: number
}

export type OverdueSyncCatchupResult = {
  skipped: boolean
  reason?: string
  plan: OverdueSyncJob[]
  steps: OverdueSyncCatchupStep[]
  startedAt?: string
  finishedAt?: string
  durationMs?: number
}

const CATCHUP_LOCK_KEY = 'overdue_sync_catchup_in_progress'
const CATCHUP_STARTED_AT_KEY = 'overdue_sync_catchup_started_at'
const CATCHUP_FINISHED_AT_KEY = 'overdue_sync_catchup_finished_at'

/** Serverless catch-up must not hold a lock past background-function limits. */
const CATCHUP_LOCK_MAX_MS_SERVERLESS = 15 * 60 * 1000
const CATCHUP_LOCK_MAX_MS_LONG_LIVED = 2 * 60 * 60 * 1000

/** Clear a leaked overdue catch-up lock (Lambda killed mid-catch-up). */
export function healStaleOverdueCatchupLock(now = Date.now()): boolean {
  if (getSyncMeta(CATCHUP_LOCK_KEY) !== '1') return false
  const startedMs = parseIsoMs(getSyncMeta(CATCHUP_STARTED_AT_KEY))
  const limitMs = isServerlessRuntime()
    ? CATCHUP_LOCK_MAX_MS_SERVERLESS
    : CATCHUP_LOCK_MAX_MS_LONG_LIVED
  if (startedMs == null || now - startedMs > limitMs) {
    deleteSyncMeta(CATCHUP_LOCK_KEY)
    return true
  }
  return false
}

function overdueJobPauseKey(job: OverdueSyncJob): ScheduledSyncJobId | null {
  switch (job) {
    case 'full-resync':
    case 'incremental':
    case 'listing-scores':
    case 'stats-cache':
    case 'deal-of-the-day':
    case 'property-addresses':
    case 'zip-boundaries':
      return job
    case 'edge-scores':
      return 'listing-scores'
    case 'publish-snapshot':
      return null
    default:
      return null
  }
}

const EXECUTION_ORDER: OverdueSyncJob[] = [
  'full-resync',
  'incremental',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
  'publish-snapshot',
  'property-addresses',
  'zip-boundaries',
  'edge-scores',
]

const CHAINED_BY_FULL_RESYNC = new Set<OverdueSyncJob>([
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
])

function overdueCatchupEnabled(): boolean {
  return process.env.ENABLE_OVERDUE_SYNC_CATCHUP !== '0'
}

function incrementalBaselineIso(
  lastIncremental: string | null,
  lastFull: string | null,
): string | null {
  const incrementalMs = parseIsoMs(lastIncremental)
  const fullMs = parseIsoMs(lastFull)
  if (incrementalMs == null) return lastFull
  if (fullMs == null) return lastIncremental
  return incrementalMs >= fullMs ? lastIncremental : lastFull
}

/** Jobs whose scheduled window passed while the host was down. Each runs at most once. */
export function buildOverdueSyncPlan(now = new Date()): OverdueSyncJob[] {
  const stats = {
    lastFullSync: getSyncMeta('last_full_sync'),
    lastIncrementalSync: getSyncMeta('last_incremental_sync'),
    lastListingScores: getSyncMeta('last_listing_scores'),
    lastStatsCache: getSyncMeta('last_stats_cache'),
    lastDealOfTheDayCache: getSyncMeta('last_deal_of_the_day_cache'),
    lastListingEdgeScores: getSyncMeta('last_listing_edge_scores'),
  }
  const lastRefreshFinished = getSyncMeta('last_refresh_finished_at')
  const propertyAddressesSyncedAt = getSyncMeta('property_addresses_synced_at')
  const incrementalIntervalMs = latestIntervalMs()
  const statsIntervalMs = statsRefreshIntervalMs()

  const overdue = new Set<OverdueSyncJob>()
  const notDeferred = (job: SyncNextOverrideJobId) => !shouldDeferScheduledJob(job, now)

  if (
    notDeferred('full-resync') &&
    (isSyncNextOverrideDue('full-resync', now) ||
      isWeeklyMondaySyncOverdue(stats.lastFullSync, 5, 0, now)) &&
    isRetsConfigured()
  ) {
    overdue.add('full-resync')
  }

  if (
    !overdue.has('full-resync') &&
    notDeferred('incremental') &&
    (isSyncNextOverrideDue('incremental', now) ||
      isIntervalSyncOverdue(
        incrementalBaselineIso(stats.lastIncrementalSync, stats.lastFullSync),
        incrementalIntervalMs,
        now,
      )) &&
    isRetsConfigured()
  ) {
    overdue.add('incremental')
  }

  if (
    !overdue.has('full-resync') &&
    notDeferred('listing-scores') &&
    (isSyncNextOverrideDue('listing-scores', now) ||
      isWeeklyMondaySyncOverdue(stats.lastListingScores, 5, 0, now))
  ) {
    overdue.add('listing-scores')
  }

  if (
    !overdue.has('full-resync') &&
    notDeferred('stats-cache') &&
    (isSyncNextOverrideDue('stats-cache', now) ||
      isIntervalSyncOverdue(stats.lastStatsCache, statsIntervalMs, now))
  ) {
    overdue.add('stats-cache')
  }

  if (
    !overdue.has('full-resync') &&
    notDeferred('deal-of-the-day') &&
    (isSyncNextOverrideDue('deal-of-the-day', now) ||
      isWeeklyMondaySyncOverdue(stats.lastDealOfTheDayCache, 5, 0, now))
  ) {
    overdue.add('deal-of-the-day')
  }

  const refreshBaseline = incrementalBaselineIso(stats.lastIncrementalSync, stats.lastFullSync)
  const refreshDue =
    (isWeeklyMondaySyncOverdue(stats.lastFullSync, 5, 0, now) ||
      isIntervalSyncOverdue(refreshBaseline, incrementalIntervalMs, now) ||
      isSyncNextOverrideDue('incremental', now) ||
      isSyncNextOverrideDue('full-resync', now)) &&
    isRetsConfigured()
  if (
    refreshDue &&
    notDeferred('incremental') &&
    isIntervalSyncOverdue(lastRefreshFinished, incrementalIntervalMs, now)
  ) {
    overdue.add('publish-snapshot')
  }

  if (
    notDeferred('property-addresses') &&
    (isSyncNextOverrideDue('property-addresses', now) ||
      isWeeklyMondaySyncOverdue(propertyAddressesSyncedAt, 1, 0, now)) &&
    isRetsConfigured()
  ) {
    overdue.add('property-addresses')
  }

  const lastZipBoundaries = getSyncMeta('last_zip_boundaries_sync')
  if (
    notDeferred('zip-boundaries') &&
    (isSyncNextOverrideDue('zip-boundaries', now) ||
      lastZipBoundaries == null ||
      isIntervalSyncOverdue(lastZipBoundaries, ZIP_BOUNDARIES_TTL_MS, now))
  ) {
    overdue.add('zip-boundaries')
  }

  if (isWeeklyMondaySyncOverdue(stats.lastListingEdgeScores, 2, 0, now)) {
    overdue.add('edge-scores')
  }

  for (const chained of CHAINED_BY_FULL_RESYNC) {
    if (overdue.has('full-resync')) overdue.delete(chained)
  }

  if (isServerlessRuntime()) {
    overdue.delete('full-resync')
  }

  return EXECUTION_ORDER.filter((job) => overdue.has(job))
}

async function runOverdueJob(job: OverdueSyncJob): Promise<OverdueSyncCatchupStep> {
  const t0 = Date.now()
  if (job === 'edge-scores') {
    const { rebuildAllListingEdgeScores } = await import('@/lib/listing-edge-score')
    try {
      const result = await rebuildAllListingEdgeScores()
      return {
        job,
        ok: true,
        message: `Edge scores rebuilt — ${result.scored.toLocaleString()} listings`,
        durationMs: result.durationMs || Date.now() - t0,
      }
    } catch (err) {
      return {
        job,
        ok: false,
        message: 'Edge score rebuild failed',
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      }
    }
  }

  const result = await runAdminSyncAction(job)
  return {
    job,
    ok: result.ok,
    message: result.message,
    detail: result.detail,
    durationMs: result.durationMs || Date.now() - t0,
  }
}

/** True when a scheduled sync window was missed (same rules as Admin “Due now”). */
export function isAnySyncOverdue(now = new Date()): boolean {
  return buildOverdueSyncPlan(now).length > 0
}

/** Run missed sync jobs serially — one pass per job type, not every missed interval. */
export async function runOverdueSyncCatchup(options?: {
  reason?: string
  /** When set, only these jobs may run (e.g. never full-resync on the 30m cron). */
  onlyJobs?: OverdueSyncJob[]
}): Promise<OverdueSyncCatchupResult> {
  if (!overdueCatchupEnabled()) {
    return { skipped: true, reason: 'disabled', plan: [], steps: [] }
  }

  if (await isScheduledSyncPausedFresh()) {
    return { skipped: true, reason: 'scheduled sync paused by admin', plan: [], steps: [] }
  }

  healStaleOverdueCatchupLock()

  if (getSyncMeta('refresh_in_progress') === '1') {
    return { skipped: true, reason: 'refresh in progress', plan: [], steps: [] }
  }

  if (getSyncMeta(CATCHUP_LOCK_KEY) === '1') {
    return { skipped: true, reason: 'catch-up already running', plan: [], steps: [] }
  }

  const pausedJobs = await getScheduledSyncPausedJobsFresh()
  const allow = options?.onlyJobs?.length ? new Set(options.onlyJobs) : null
  const plan = buildOverdueSyncPlan().filter((job) => {
    if (allow && !allow.has(job)) return false
    const pauseKey = overdueJobPauseKey(job)
    return pauseKey == null || !pausedJobs[pauseKey]
  })
  if (plan.length === 0) {
    return { skipped: true, reason: 'nothing overdue', plan: [], steps: [] }
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  setSyncMeta(CATCHUP_LOCK_KEY, '1')
  setSyncMeta(CATCHUP_STARTED_AT_KEY, startedAt)

  const reason = options?.reason?.trim()
  console.info(
    `[sync-overdue] catch-up beginning${reason ? ` (${reason})` : ''}: ${plan.join(' → ')}`,
  )

  const steps: OverdueSyncCatchupStep[] = []

  try {
    for (const job of plan) {
      const step = await runOverdueJob(job)
      steps.push(step)
      console.info(
        `[sync-overdue] ${job} ${step.ok ? 'ok' : 'failed'} in ${step.durationMs}ms — ${step.message}`,
      )
      if (!step.ok && (job === 'full-resync' || job === 'incremental')) {
        console.warn('[sync-overdue] stopping after MLS sync failure')
        break
      }
    }

    const finishedAt = new Date().toISOString()
    setSyncMeta(CATCHUP_FINISHED_AT_KEY, finishedAt)

    return {
      skipped: false,
      plan,
      steps,
      startedAt,
      finishedAt,
      durationMs: Date.now() - t0,
    }
  } finally {
    deleteSyncMeta(CATCHUP_LOCK_KEY)
  }
}

export function readOverdueSyncCatchupStatus(): {
  lastStartedAt: string | null
  lastFinishedAt: string | null
  overdueNow: OverdueSyncJob[]
} {
  return {
    lastStartedAt: getSyncMeta(CATCHUP_STARTED_AT_KEY),
    lastFinishedAt: getSyncMeta(CATCHUP_FINISHED_AT_KEY),
    overdueNow: buildOverdueSyncPlan(),
  }
}
