/**
 * Queue drain + forked job supervision for the always-on mls-sync service.
 *
 * Two jobs used to share this process's heap, which is what OOM-killed the
 * container. Now the parent claims rows from `sync_queue`, forks a child per
 * row, holds a deadline over it, and writes the outcome back.
 *
 * Up to MLS_SYNC_MAX_CHILDREN (default 3) different jobs run at once. The same
 * job_id still cannot run twice — that is a unique index on sync_queue. An
 * Incremental pull can therefore overlap a stats rebuild and a CAMA fill.
 *
 * A child that blows its budget is killed and recorded as `timeout`. A child
 * that dies without reporting — OOM, container signal — is recorded as
 * `crashed`. Either way the row reaches a terminal state.
 */

import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { ScheduledSyncJobId } from '../../lib/scheduled-sync-jobs-shared'
import {
  SYNC_QUEUE_RUNNER_JOBS,
  type SyncQueueItem,
} from '../../lib/sync-queue-shared'
import type { SyncJobChildMessage, SyncJobChildSpec } from './job-child'

const CHILD_ENTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'job-child.ts',
)

/** How often to look for work. Short: a Sync now should not wait a minute. */
const DRAIN_POLL_MS = 5_000

/** Grace between "please stop" and SIGKILL once a child is over budget. */
const KILL_GRACE_MS = 15_000

/** Keep the queue row's heartbeat fresh so another host cannot reap a live run. */
const QUEUE_HEARTBEAT_MS = 60_000

/** Cadence for proving to Netlify that a queue-aware runner is on duty. */
const DRAIN_HEARTBEAT_MS = 60_000

export const MLS_SYNC_MAX_CHILDREN_DEFAULT = 3
export const MLS_SYNC_MAX_CHILDREN_MIN = 1
export const MLS_SYNC_MAX_CHILDREN_MAX = 4

/** How many different jobs this process will supervise at once. */
export function resolveMaxChildren(
  raw: string | undefined | null = process.env.MLS_SYNC_MAX_CHILDREN,
): number {
  const text = (raw ?? '').trim()
  if (!text) return MLS_SYNC_MAX_CHILDREN_DEFAULT
  const n = Number(text)
  if (!Number.isFinite(n)) return MLS_SYNC_MAX_CHILDREN_DEFAULT
  return Math.min(
    MLS_SYNC_MAX_CHILDREN_MAX,
    Math.max(MLS_SYNC_MAX_CHILDREN_MIN, Math.round(n)),
  )
}

/**
 * Optional heap cap for children. Setting this is what converts a container-wide
 * OOM kill into a single failed job: V8 aborts the child at the cap while the
 * parent keeps its own small heap and lives to record it.
 */
function childHeapMb(): number | null {
  const raw = Number(process.env.MLS_SYNC_CHILD_MAX_OLD_SPACE_MB ?? '')
  return Number.isFinite(raw) && raw >= 128 ? Math.floor(raw) : null
}

export type RunnerChild = {
  jobId: string
  queueId: number
  pid: number | null
  startedAt: string
  deadlineAt: string | null
}

export type RunnerLastOutcome = {
  jobId: string
  outcome: string
  ok: boolean
  detail: string | null
  finishedAt: string
}

export type RunnerState = {
  children: RunnerChild[]
  maxChildren: number
  /** First live child — older /health clients still read one "current". */
  current: SyncQueueItem | null
  childPid: number | null
  childStartedAt: string | null
  lastOutcome: RunnerLastOutcome | null
}

type LiveChild = {
  item: SyncQueueItem
  pid: number | null
  startedAt: string
}

const live = new Map<number, LiveChild>()
let lastOutcome: RunnerLastOutcome | null = null

export function readRunnerState(): RunnerState {
  const children: RunnerChild[] = [...live.values()].map((row) => ({
    jobId: row.item.jobId,
    queueId: row.item.id,
    pid: row.pid,
    startedAt: row.startedAt,
    deadlineAt: row.item.deadlineAt,
  }))
  const first = [...live.values()][0] ?? null
  return {
    children,
    maxChildren: resolveMaxChildren(),
    current: first?.item ?? null,
    childPid: first?.pid ?? null,
    childStartedAt: first?.startedAt ?? null,
    lastOutcome,
  }
}

export function runnerIsBusy(): boolean {
  return live.size > 0
}

export function runnerSlotCount(): number {
  return live.size
}

/** Stable id for `claimed_by`, so two deploys are distinguishable in Admin. */
function runnerId(): string {
  const service = process.env.RAILWAY_SERVICE_NAME?.trim() || 'mls-sync'
  const instance =
    process.env.RAILWAY_REPLICA_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    String(process.pid)
  return `${service}:${instance.slice(0, 24)}`
}

type ChildOutcome = {
  ok: boolean
  outcome: 'done' | 'failed' | 'timeout' | 'crashed'
  detail: string
  exitCode: number | null
  signal: string | null
}

/**
 * Fork the job, hold its deadline, and resolve with what actually happened.
 *
 * Never rejects: a supervision failure has to end as a recorded outcome, not an
 * unhandled rejection that leaves the row stuck at `running`.
 */
function superviseChild(
  item: SyncQueueItem,
  onPid: (pid: number | null) => void,
): Promise<ChildOutcome> {
  const spec: SyncJobChildSpec = {
    queueId: item.id,
    jobId: item.jobId as SyncJobChildSpec['jobId'],
    trigger: item.trigger,
    ...(Array.isArray(item.payload.towns)
      ? { towns: (item.payload.towns as unknown[]).filter(
          (t): t is string => typeof t === 'string',
        ) }
      : {}),
    ...(item.payload.statusScope === 'active' ||
    item.payload.statusScope === 'closed' ||
    item.payload.statusScope === 'all'
      ? { statusScope: item.payload.statusScope }
      : {}),
    ...(typeof item.payload.force === 'boolean'
      ? { force: item.payload.force }
      : {}),
    ...(typeof item.payload.stampWeek === 'boolean'
      ? { stampWeek: item.payload.stampWeek }
      : {}),
  }

  const heapMb = childHeapMb()
  const execArgv = heapMb
    ? [...process.execArgv, `--max-old-space-size=${heapMb}`]
    : process.execArgv

  const deadlineMs = item.deadlineAt
    ? Math.max(60_000, Date.parse(item.deadlineAt) - Date.now())
    : 30 * 60_000

  return new Promise<ChildOutcome>((resolve) => {
    let child: ChildProcess
    try {
      child = fork(CHILD_ENTRY, [], {
        execArgv,
        stdio: 'inherit',
        env: {
          ...process.env,
          MLS_SYNC_SERVICE: '1',
          SYNC_JOB_SPEC: JSON.stringify(spec),
        },
      })
    } catch (err) {
      resolve({
        ok: false,
        outcome: 'crashed',
        detail: `could not fork child — ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
        signal: null,
      })
      return
    }

    onPid(child.pid ?? null)

    let reported: { ok: boolean; message: string; detail?: string } | null = null
    let killedForDeadline = false
    let settled = false

    let killTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (outcome: ChildOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(deadlineTimer)
      if (killTimer) clearTimeout(killTimer)
      resolve(outcome)
    }

    const deadlineTimer = setTimeout(() => {
      killedForDeadline = true
      const minutes = Math.round(deadlineMs / 60_000)
      console.error(
        `[mls-sync] ${item.jobId} blew its ${minutes}m budget — killing child pid ${child.pid}`,
      )
      try {
        child.send({ type: 'shutdown' })
      } catch {
        /* channel may already be gone */
      }
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null) {
          console.error(
            `[mls-sync] ${item.jobId} ignored SIGTERM — SIGKILL child pid ${child.pid}`,
          )
          child.kill('SIGKILL')
        }
      }, KILL_GRACE_MS)
    }, deadlineMs)

    child.on('message', (raw: unknown) => {
      const message = raw as SyncJobChildMessage
      if (!message || typeof message !== 'object') return
      if (message.type === 'result') {
        reported = {
          ok: message.ok,
          message: message.message,
          ...(message.detail ? { detail: message.detail } : {}),
        }
      }
    })

    child.on('error', (err) => {
      console.error(`[mls-sync] ${item.jobId} child error`, err)
    })

    child.on('exit', (code, signal) => {
      onPid(null)

      if (killedForDeadline) {
        finish({
          ok: false,
          outcome: 'timeout',
          detail: `killed after ${Math.round(deadlineMs / 60_000)}m budget (${
            signal ?? `exit ${code}`
          })`,
          exitCode: code,
          signal: signal ?? null,
        })
        return
      }

      if (reported) {
        const detail = [reported.message, reported.detail]
          .filter(Boolean)
          .join(' — ')
        finish({
          ok: reported.ok,
          outcome: reported.ok ? 'done' : 'failed',
          detail,
          exitCode: code,
          signal: signal ?? null,
        })
        return
      }

      finish({
        ok: false,
        outcome: 'crashed',
        detail:
          signal === 'SIGKILL'
            ? 'child was SIGKILLed before reporting — most likely out of memory'
            : `child exited ${code ?? '?'}${signal ? ` (${signal})` : ''} before reporting`,
        exitCode: code,
        signal: signal ?? null,
      })
    })
  })
}

async function runClaimedItem(item: SyncQueueItem): Promise<void> {
  const startedAt = new Date().toISOString()
  if (!live.has(item.id)) {
    live.set(item.id, { item, pid: null, startedAt })
  }

  const { finishSyncQueueItem, heartbeatSyncQueueItem } = await import(
    '../../lib/sync-queue'
  )

  const budgetMinutes = item.deadlineAt
    ? Math.round(
        (Date.parse(item.deadlineAt) -
          Date.parse(item.claimedAt ?? item.requestedAt)) /
          60_000,
      )
    : null
  console.info(
    `[mls-sync] claimed ${item.jobId} (queue #${item.id}, ${item.trigger}${
      budgetMinutes ? `, ${budgetMinutes}m budget` : ''
    } · ${live.size}/${resolveMaxChildren()} slots)`,
  )

  const beat = setInterval(() => {
    void heartbeatSyncQueueItem(item.id).catch((err) => {
      console.warn('[mls-sync] queue heartbeat failed', err)
    })
  }, QUEUE_HEARTBEAT_MS)

  try {
    const outcome = await superviseChild(item, (pid) => {
      const row = live.get(item.id)
      if (row) row.pid = pid
    })
    await finishSyncQueueItem(item.id, {
      ok: outcome.ok,
      outcome: outcome.outcome,
      detail: outcome.detail,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
    })
    lastOutcome = {
      jobId: item.jobId,
      outcome: outcome.outcome,
      ok: outcome.ok,
      detail: outcome.detail || null,
      finishedAt: new Date().toISOString(),
    }
    console.info(
      `[mls-sync] ${item.jobId} → ${outcome.outcome}${outcome.detail ? ` — ${outcome.detail}` : ''}`,
    )
  } catch (err) {
    console.error('[mls-sync] could not record queue outcome', err)
    await finishSyncQueueItem(item.id, {
      ok: false,
      outcome: 'crashed',
      detail: `supervisor error — ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => {})
  } finally {
    clearInterval(beat)
    live.delete(item.id)
  }
}

async function readJobBudgets(): Promise<Partial<Record<ScheduledSyncJobId, number>>> {
  const out: Partial<Record<ScheduledSyncJobId, number>> = {}
  try {
    const { readSyncScheduleConfigFresh } = await import(
      '../../lib/sync-schedule-config'
    )
    const { resolveJobBudgetMs } = await import(
      '../../lib/sync-schedule-config-shared'
    )
    const config = await readSyncScheduleConfigFresh()
    for (const jobId of SYNC_QUEUE_RUNNER_JOBS) {
      out[jobId] = resolveJobBudgetMs(jobId, config.jobs[jobId])
    }
  } catch (err) {
    console.warn('[mls-sync] budget read failed — using defaults', err)
    const { defaultJobBudgetMinutes } = await import(
      '../../lib/sync-queue-shared'
    )
    for (const jobId of SYNC_QUEUE_RUNNER_JOBS) {
      out[jobId] = defaultJobBudgetMinutes(jobId) * 60_000
    }
  }
  return out
}

let claiming = false

/**
 * Fill empty slots: claim waiting jobs and supervise them without waiting for
 * the first child to finish. Same job_id cannot be claimed twice (queue index).
 */
export async function drainSyncQueueOnce(): Promise<boolean> {
  if (claiming) return false
  const max = resolveMaxChildren()
  if (live.size >= max) return false
  claiming = true
  let started = 0
  try {
    const { claimNextSyncJob, reapAbandonedSyncQueueItems } = await import(
      '../../lib/sync-queue'
    )

    await reapAbandonedSyncQueueItems()
    const budgets = await readJobBudgets()
    while (live.size < max) {
      const item = await claimNextSyncJob({
        runner: runnerId(),
        jobIds: SYNC_QUEUE_RUNNER_JOBS,
        budgetMsForJob: (jobId) =>
          budgets[jobId as ScheduledSyncJobId] ?? 30 * 60_000,
      })
      if (!item) break
      live.set(item.id, {
        item,
        pid: null,
        startedAt: new Date().toISOString(),
      })
      started += 1
      void runClaimedItem(item).catch((err) => {
        console.warn(`[mls-sync] ${item.jobId} supervisor failed`, err)
        live.delete(item.id)
      })
    }
    return started > 0
  } finally {
    claiming = false
  }
}

/** Poll for work forever. Fills empty slots; does not wait on running children. */
export function startSyncQueueDrain(): void {
  const tick = () => {
    void drainSyncQueueOnce().catch((err) => {
      console.warn('[mls-sync] queue drain failed', err)
    })
  }
  setTimeout(tick, 5_000)
  setInterval(tick, DRAIN_POLL_MS)

  const stampDrain = () => {
    void import('../../lib/sync-queue')
      .then(({ stampSyncQueueDrainHeartbeat }) => stampSyncQueueDrainHeartbeat())
      .catch((err) => console.warn('[mls-sync] drain heartbeat failed', err))
  }
  stampDrain()
  setInterval(stampDrain, DRAIN_HEARTBEAT_MS)

  const heapMb = childHeapMb()
  const max = resolveMaxChildren()
  console.info(
    `[mls-sync] queue drain every ${DRAIN_POLL_MS / 1000}s · ${max} slots · jobs: ${SYNC_QUEUE_RUNNER_JOBS.join(', ')}` +
      (heapMb
        ? ` · child heap cap ${heapMb}MB`
        : ' · no child heap cap (set MLS_SYNC_CHILD_MAX_OLD_SPACE_MB so an OOM kills the job, not this service)'),
  )
}

/** Kill every live child on shutdown so a deploy does not orphan a pull. */
export function stopAllChildren(): void {
  for (const row of live.values()) {
    if (row.pid == null) continue
    try {
      process.kill(row.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

/** @deprecated Use stopAllChildren — kept so older callers still compile. */
export function stopCurrentChild(): void {
  stopAllChildren()
}
