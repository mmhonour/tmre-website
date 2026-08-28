/**
 * Durable sync queue — client-safe types, labels, and the runner's job list.
 *
 * The queue is the single answer to "what wants to run and what is running".
 * Before it there were five `pending*` variables inside the Railway process and
 * a Configure radio naming a host per job; between them nobody could say what
 * was waiting, and a container restart silently emptied the lot.
 */

import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'

/**
 * Jobs the always-on runner (Railway mls-sync) claims off the queue and runs in
 * a forked child. Everything here is minutes of work against a whole town's
 * inventory, which is why it cannot live in a serverless slot.
 *
 * A job absent from this list never reaches the queue: its Netlify scheduled
 * function keeps owning it end to end.
 */
export const SYNC_QUEUE_RUNNER_JOBS: readonly ScheduledSyncJobId[] = [
  'incremental',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
  'property-addresses',
  'market-digest',
]

export function isSyncQueueRunnerJob(
  jobId: string,
): jobId is ScheduledSyncJobId {
  return (SYNC_QUEUE_RUNNER_JOBS as readonly string[]).includes(jobId)
}

export const SYNC_QUEUE_STATES = ['queued', 'running', 'done', 'failed'] as const
export type SyncQueueState = (typeof SYNC_QUEUE_STATES)[number]

/**
 * How a run ended.
 * - timeout: the parent killed a child that outlived its budget
 * - crashed: the child died without reporting (OOM kill, container restart)
 */
export const SYNC_QUEUE_OUTCOMES = [
  'done',
  'failed',
  'timeout',
  'crashed',
  'cancelled',
] as const
export type SyncQueueOutcome = (typeof SYNC_QUEUE_OUTCOMES)[number]

export type SyncQueueItem = {
  id: number
  jobId: string
  state: SyncQueueState
  priority: number
  trigger: string
  requestedAt: string
  claimedAt: string | null
  claimedBy: string | null
  deadlineAt: string | null
  heartbeatAt: string | null
  finishedAt: string | null
  attempts: number
  ok: boolean | null
  outcome: SyncQueueOutcome | null
  detail: string | null
  exitCode: number | null
  signal: string | null
  payload: Record<string, unknown>
}

/** What Admin polls: the live queue plus a short tail of finished runs. */
export type SyncQueueSnapshot = {
  waiting: SyncQueueItem[]
  running: SyncQueueItem[]
  recent: SyncQueueItem[]
  /** Last heartbeat from the runner process, whether or not a job is in flight. */
  runnerHeartbeatAt: string | null
  /**
   * Last time something actually drained the queue. Distinct from the heartbeat
   * above: a runner build that predates the queue is up and beating while
   * claiming nothing, and that pair is what Netlify must not read as healthy.
   */
  drainHeartbeatAt: string | null
  /** True when nothing has drained the queue recently enough to be trusted. */
  runnerStale: boolean
}

export function emptySyncQueueSnapshot(): SyncQueueSnapshot {
  return {
    waiting: [],
    running: [],
    recent: [],
    runnerHeartbeatAt: null,
    drainHeartbeatAt: null,
    runnerStale: true,
  }
}

/** Sync now jumps the sweeps; a sweep never displaces an operator's request. */
export const SYNC_QUEUE_PRIORITY_MANUAL = 10
export const SYNC_QUEUE_PRIORITY_SWEEP = 100

/**
 * Default kill budget per job, in minutes.
 *
 * These are deliberately generous — the point is not to tune runtimes, it is
 * that a wedged child stops being indistinguishable from a slow one. A job that
 * routinely lands near its budget wants a bigger number in Configure, not a
 * quieter watchdog.
 */
export const SYNC_JOB_DEFAULT_BUDGET_MINUTES: Record<ScheduledSyncJobId, number> =
  {
    'full-resync': 240,
    incremental: 45,
    'listing-scores': 60,
    'edge-scores': 45,
    'stats-cache': 75,
    'deal-of-the-day': 45,
    'property-addresses': 120,
    'vision-addresses': 90,
    'zip-boundaries': 45,
    'fomc-sync': 10,
    'cpi-sync': 10,
    'market-digest': 15,
  }

export const SYNC_JOB_BUDGET_MIN_MINUTES = 1
export const SYNC_JOB_BUDGET_MAX_MINUTES = 480

export function defaultJobBudgetMinutes(jobId: string): number {
  return SYNC_JOB_DEFAULT_BUDGET_MINUTES[jobId as ScheduledSyncJobId] ?? 60
}

export function clampJobBudgetMinutes(value: number): number {
  if (!Number.isFinite(value)) return SYNC_JOB_BUDGET_MIN_MINUTES
  return Math.min(
    SYNC_JOB_BUDGET_MAX_MINUTES,
    Math.max(SYNC_JOB_BUDGET_MIN_MINUTES, Math.round(value)),
  )
}

export function syncQueueOutcomeLabel(outcome: SyncQueueOutcome | null): string {
  switch (outcome) {
    case 'done':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'timeout':
      return 'Killed — over budget'
    case 'crashed':
      return 'Crashed — child died'
    case 'cancelled':
      return 'Cancelled'
    default:
      return '—'
  }
}

export function syncQueueStateLabel(item: SyncQueueItem): string {
  if (item.state === 'queued') return 'Queued'
  if (item.state === 'running') return 'Running'
  return syncQueueOutcomeLabel(item.outcome)
}

/** 1-based position of this job in the waiting line, or null when absent. */
export function syncQueuePositionForJob(
  snapshot: SyncQueueSnapshot,
  jobId: string,
): number | null {
  const index = snapshot.waiting.findIndex((item) => item.jobId === jobId)
  return index === -1 ? null : index + 1
}

export function syncQueueItemForJob(
  snapshot: SyncQueueSnapshot,
  jobId: string,
): SyncQueueItem | null {
  return (
    snapshot.running.find((item) => item.jobId === jobId) ??
    snapshot.waiting.find((item) => item.jobId === jobId) ??
    null
  )
}

/** Remaining budget in ms for a running item, negative once it is overdue. */
export function syncQueueBudgetRemainingMs(
  item: SyncQueueItem,
  now = Date.now(),
): number | null {
  if (!item.deadlineAt) return null
  const deadline = Date.parse(item.deadlineAt)
  return Number.isFinite(deadline) ? deadline - now : null
}
