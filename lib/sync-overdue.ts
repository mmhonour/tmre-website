import 'server-only'

import { runAdminSyncAction } from '@/lib/admin-sync-actions'
import type { AdminSyncActionId } from '@/lib/admin-sync-types'
import { parseIsoMs } from '@/lib/admin-sync-schedule'
import {
  deleteSyncMeta,
  getSyncMeta,
  releaseTimedLock,
  setSyncMeta,
  tryAcquireTimedLock,
} from '@/lib/db/sync-meta-store'
import { marketDigestQueueBackoffUntil } from '@/lib/market-digest-config'
import { isRetsConfigured } from '@/lib/rets'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  getScheduledSyncPausedJobsFresh,
  isScheduledSyncPausedFresh,
  type ScheduledSyncJobId,
} from '@/lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '@/lib/sync-next-override'
import {
  isScheduledJobDue,
  readSyncScheduleConfig,
} from '@/lib/sync-schedule-config'
import { isSyncQueueRunnerJob } from '@/lib/sync-queue-shared'

export type OverdueSyncJob = AdminSyncActionId

export type OverdueSyncCatchupStep = {
  job: OverdueSyncJob
  ok: boolean
  message: string
  detail?: string
  durationMs: number
  /** True when the action only enqueued a worker — not a finished rebuild. */
  queued?: boolean
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
  const lockVal = getSyncMeta(CATCHUP_LOCK_KEY)
  if (!lockVal) return false
  const limitMs = isServerlessRuntime()
    ? CATCHUP_LOCK_MAX_MS_SERVERLESS
    : CATCHUP_LOCK_MAX_MS_LONG_LIVED
  const startedMs =
    parseIsoMs(lockVal) ?? parseIsoMs(getSyncMeta(CATCHUP_STARTED_AT_KEY))
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
    case 'edge-scores':
    case 'stats-cache':
    case 'deal-of-the-day':
    case 'property-addresses':
    case 'vision-addresses':
    case 'zip-boundaries':
    case 'fomc-sync':
    case 'cpi-sync':
    case 'market-digest':
      return job
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
  'edge-scores',
  'stats-cache',
  'deal-of-the-day',
  'publish-snapshot',
  'property-addresses',
  'vision-addresses',
  'zip-boundaries',
  'fomc-sync',
  'cpi-sync',
  'market-digest',
]

const CHAINED_BY_FULL_RESYNC = new Set<OverdueSyncJob>([
  'listing-scores',
  'edge-scores',
  'stats-cache',
  'deal-of-the-day',
])

function overdueCatchupEnabled(): boolean {
  return process.env.ENABLE_OVERDUE_SYNC_CATCHUP !== '0'
}

/** Jobs whose scheduled window passed while the host was down. Each runs at most once. */
export function buildOverdueSyncPlan(now = new Date()): OverdueSyncJob[] {
  const schedule = readSyncScheduleConfig()
  // Prefer Configure Order for catch-up sequencing.
  const executionOrder: OverdueSyncJob[] = [
    ...schedule.order.filter((id) => id !== 'full-resync'),
    'publish-snapshot',
  ]

  const overdue = new Set<OverdueSyncJob>()

  // Full resync is retired — never catch it up (bucket replace deletes older MLS rows).

  if (
    isScheduledJobDue('incremental', now, schedule) &&
    isRetsConfigured()
  ) {
    overdue.add('incremental')
  }

  if (isScheduledJobDue('listing-scores', now, schedule)) {
    overdue.add('listing-scores')
  }

  if (isScheduledJobDue('edge-scores', now, schedule)) {
    overdue.add('edge-scores')
  }

  if (isScheduledJobDue('stats-cache', now, schedule)) {
    overdue.add('stats-cache')
  }

  if (isScheduledJobDue('deal-of-the-day', now, schedule)) {
    overdue.add('deal-of-the-day')
  }

  if (
    (overdue.has('incremental') || overdue.has('full-resync')) &&
    !shouldDeferScheduledJob('incremental', now)
  ) {
    // Refresh-finished stamp when MLS refresh itself is due.
    overdue.add('publish-snapshot')
  }

  if (
    isScheduledJobDue('property-addresses', now, schedule) &&
    isRetsConfigured()
  ) {
    overdue.add('property-addresses')
  }

  if (isScheduledJobDue('vision-addresses', now, schedule)) {
    overdue.add('vision-addresses')
  }

  if (isScheduledJobDue('zip-boundaries', now, schedule)) {
    overdue.add('zip-boundaries')
  }

  if (isScheduledJobDue('fomc-sync', now, schedule)) {
    overdue.add('fomc-sync')
  }

  if (isScheduledJobDue('cpi-sync', now, schedule)) {
    overdue.add('cpi-sync')
  }

  // Never catch the brief up from here. Every other lane writes to a database,
  // so a stray catch-up is at worst wasted work; this one puts a real email in
  // someone's inbox, and a developer's `next dev` is a long-lived Node process
  // too — which is how the Monday brief has been going out from a laptop against
  // a local watermark, invisible to production. The sync queue owns the send now,
  // and only the runner claims it.
  if (
    !isSyncQueueRunnerJob('market-digest') &&
    isScheduledJobDue('market-digest', now, schedule) &&
    // A refused worker hop stays refused for a while; retrying it every catch-up
    // pass only burned invokes and buried History under identical failures.
    !marketDigestQueueBackoffUntil(now.getTime())
  ) {
    overdue.add('market-digest')
  }

  for (const chained of CHAINED_BY_FULL_RESYNC) {
    if (overdue.has('full-resync')) overdue.delete(chained)
  }

  if (isServerlessRuntime()) {
    overdue.delete('full-resync')
  }

  const seen = new Set<OverdueSyncJob>()
  const ordered: OverdueSyncJob[] = []
  for (const job of executionOrder) {
    if (overdue.has(job) && !seen.has(job)) {
      seen.add(job)
      ordered.push(job)
    }
  }
  for (const job of EXECUTION_ORDER) {
    if (overdue.has(job) && !seen.has(job)) {
      seen.add(job)
      ordered.push(job)
    }
  }
  return ordered
}

async function runOverdueJob(
  job: OverdueSyncJob,
  executeInProcess: boolean,
): Promise<OverdueSyncCatchupStep> {
  const t0 = Date.now()
  const result = await runAdminSyncAction(job, { executeInProcess })
  return {
    job,
    ok: result.ok,
    message: result.message,
    detail: result.detail,
    durationMs: result.durationMs || Date.now() - t0,
    queued: Boolean(result.backgroundQueued),
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
  /** Dedicated worker: omit this job so catch-up cannot skip / re-queue it. */
  exceptJob?: OverdueSyncJob
  /**
   * Run rebuilds in this process instead of re-queuing workers.
   * Required on Netlify when catch-up is invoked from an already-running worker.
   */
  executeInProcess?: boolean
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

  const pausedJobs = await getScheduledSyncPausedJobsFresh()
  const allow = options?.onlyJobs?.length ? new Set(options.onlyJobs) : null
  const exceptJob = options?.exceptJob
  const executeInProcess = options?.executeInProcess === true
  const plan = buildOverdueSyncPlan().filter((job) => {
    if (exceptJob && job === exceptJob) return false
    if (allow && !allow.has(job)) return false
    const pauseKey = overdueJobPauseKey(job)
    return pauseKey == null || !pausedJobs[pauseKey]
  })
  if (plan.length === 0) {
    return { skipped: true, reason: 'nothing overdue', plan: [], steps: [] }
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const lockLimitMs = isServerlessRuntime()
    ? CATCHUP_LOCK_MAX_MS_SERVERLESS
    : CATCHUP_LOCK_MAX_MS_LONG_LIVED
  const acquired = await tryAcquireTimedLock(
    CATCHUP_LOCK_KEY,
    startedAt,
    lockLimitMs,
  )
  if (!acquired) {
    return { skipped: true, reason: 'catch-up already running', plan: [], steps: [] }
  }
  setSyncMeta(CATCHUP_STARTED_AT_KEY, startedAt)

  const reason = options?.reason?.trim()
  console.info(
    `[sync-overdue] catch-up beginning${reason ? ` (${reason})` : ''}: ${plan.join(' → ')}`,
  )

  const steps: OverdueSyncCatchupStep[] = []

  try {
    for (const job of plan) {
      const step = await runOverdueJob(job, executeInProcess)
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
    await releaseTimedLock(CATCHUP_LOCK_KEY, startedAt)
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
