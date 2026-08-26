/**
 * Queue drain + forked job supervision for the always-on mls-sync service.
 *
 * Two jobs used to share this process's heap, which is what OOM-killed the
 * container: the loser of that race was a `pending*` variable that the crash
 * then erased. Now the parent does nothing but claim rows from `sync_queue`,
 * fork a child per row, hold a deadline over it, and write the outcome back.
 *
 * A child that blows its budget is killed and recorded as `timeout`. A child
 * that dies without reporting — OOM, container signal — is recorded as
 * `crashed`. Either way the row reaches a terminal state, so the next request
 * for that job is not blocked by a ghost.
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

/**
 * Optional heap cap for children. Setting this is what converts a container-wide
 * OOM kill into a single failed job: V8 aborts the child at the cap while the
 * parent keeps its own small heap and lives to record it.
 */
function childHeapMb(): number | null {
  const raw = Number(process.env.MLS_SYNC_CHILD_MAX_OLD_SPACE_MB ?? '')
  return Number.isFinite(raw) && raw >= 128 ? Math.floor(raw) : null
}

export type RunnerState = {
  /** The row a child is working on right now. */
  current: SyncQueueItem | null
  childPid: number | null
  childStartedAt: string | null
  lastOutcome: {
    jobId: string
    outcome: string
    ok: boolean
    detail: string | null
    finishedAt: string
  } | null
}

const state: RunnerState = {
  current: null,
  childPid: null,
  childStartedAt: null,
  lastOutcome: null,
}

export function readRunnerState(): RunnerState {
  return { ...state }
}

export function runnerIsBusy(): boolean {
  return state.current != null
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
function superviseChild(item: SyncQueueItem): Promise<ChildOutcome> {
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

    state.childPid = child.pid ?? null
    state.childStartedAt = new Date().toISOString()

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
      // SIGTERM is a request. A child wedged in a native RETS/XML call will not
      // hear it, and the whole reason for the deadline is that we stop waiting.
      // `child.killed` only says a signal was delivered, not that the process
      // died, so the exit status is the thing to look at here.
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
      state.childPid = null
      state.childStartedAt = null

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

      // No result message: the child died before it could say anything. On this
      // box that has almost always meant the kernel OOM killer.
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
  const {
    finishSyncQueueItem,
    heartbeatSyncQueueItem,
  } = await import('../../lib/sync-queue')

  state.current = item
  const budgetMinutes = item.deadlineAt
    ? Math.round((Date.parse(item.deadlineAt) - Date.parse(item.claimedAt ?? item.requestedAt)) / 60_000)
    : null
  console.info(
    `[mls-sync] claimed ${item.jobId} (queue #${item.id}, ${item.trigger}${
      budgetMinutes ? `, ${budgetMinutes}m budget` : ''
    })`,
  )

  const beat = setInterval(() => {
    void heartbeatSyncQueueItem(item.id).catch((err) => {
      console.warn('[mls-sync] queue heartbeat failed', err)
    })
  }, QUEUE_HEARTBEAT_MS)

  try {
    const outcome = await superviseChild(item)
    await finishSyncQueueItem(item.id, {
      ok: outcome.ok,
      outcome: outcome.outcome,
      detail: outcome.detail,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
    })
    state.lastOutcome = {
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
    // Recording the outcome failed, not the job. Say so rather than leaving the
    // row at `running` for the reaper to guess about five minutes from now.
    console.error('[mls-sync] could not record queue outcome', err)
    await finishSyncQueueItem(item.id, {
      ok: false,
      outcome: 'crashed',
      detail: `supervisor error — ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => {})
  } finally {
    clearInterval(beat)
    state.current = null
  }
}

/**
 * Kill budgets straight from Configure, read fresh on every claim so raising a
 * budget in Admin applies to the next job without a redeploy.
 */
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

let draining = false

/** One drain pass: claim at most one job and see it through. */
export async function drainSyncQueueOnce(): Promise<boolean> {
  if (draining || state.current) return false
  draining = true
  try {
    const { claimNextSyncJob, reapAbandonedSyncQueueItems } = await import(
      '../../lib/sync-queue'
    )

    await reapAbandonedSyncQueueItems()
    const budgets = await readJobBudgets()
    const item = await claimNextSyncJob({
      runner: runnerId(),
      jobIds: SYNC_QUEUE_RUNNER_JOBS,
      budgetMsForJob: (jobId) =>
        budgets[jobId as ScheduledSyncJobId] ?? 30 * 60_000,
    })
    if (!item) return false
    await runClaimedItem(item)
    return true
  } finally {
    draining = false
  }
}

/** Poll for work forever. One job at a time, whichever asked first. */
export function startSyncQueueDrain(): void {
  const tick = () => {
    void drainSyncQueueOnce().catch((err) => {
      console.warn('[mls-sync] queue drain failed', err)
    })
  }
  setTimeout(tick, 5_000)
  setInterval(tick, DRAIN_POLL_MS)

  const heapMb = childHeapMb()
  console.info(
    `[mls-sync] queue drain every ${DRAIN_POLL_MS / 1000}s · jobs: ${SYNC_QUEUE_RUNNER_JOBS.join(', ')}` +
      (heapMb
        ? ` · child heap cap ${heapMb}MB`
        : ' · no child heap cap (set MLS_SYNC_CHILD_MAX_OLD_SPACE_MB so an OOM kills the job, not this service)'),
  )
}

/** Kill the current child on shutdown so a deploy does not orphan a pull. */
export function stopCurrentChild(): void {
  if (state.childPid == null) return
  try {
    process.kill(state.childPid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}
