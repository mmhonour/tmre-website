import 'server-only'

import { execute, query, queryOne, withTransaction } from '@/lib/db/postgres'
import {
  emptySyncQueueSnapshot,
  SYNC_QUEUE_PRIORITY_SWEEP,
  type SyncQueueItem,
  type SyncQueueOutcome,
  type SyncQueueSnapshot,
  type SyncQueueState,
} from '@/lib/sync-queue-shared'

/**
 * Durable sync work queue (Neon `sync_queue`).
 *
 * Everything that used to be a `pending*` variable inside the Railway process
 * lives here instead, so a request survives the container that received it and
 * Admin can show the same waiting line the runner is working from.
 *
 * Concurrency is the database's problem, not a module flag's: one partial unique
 * index keeps a job from queueing twice, another keeps it from running twice,
 * and claims take `FOR UPDATE SKIP LOCKED` so two hosts can poll the same table
 * without racing.
 */

/** How long a claimed row may go without a heartbeat before it is reaped. */
export const SYNC_QUEUE_HEARTBEAT_STALE_MS = 5 * 60 * 1000

/** How long the runner process may be silent before Admin calls it stale. */
export const SYNC_QUEUE_RUNNER_STALE_MS = 10 * 60 * 1000

/**
 * How long to leave a job alone after it timed out or crashed. An OOM takes the
 * whole container with it, so without a cooldown the sweep re-enqueues the same
 * fatal job on every boot and starves everything behind it.
 */
export const SYNC_QUEUE_FAILURE_COOLDOWN_MS = 30 * 60 * 1000

/** Terminal rows kept for the dashboard; older ones are pruned on claim. */
const SYNC_QUEUE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

let ensured: Promise<void> | null = null

/**
 * Netlify does not run migrations on deploy, so the table has to be able to
 * appear from the app side too. Same DDL as db/migrations/0022_sync_queue.sql.
 */
export async function ensureSyncQueueTable(): Promise<void> {
  if (ensured) return ensured
  ensured = (async () => {
    await execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        job_id        text        NOT NULL,
        payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
        state         text        NOT NULL DEFAULT 'queued',
        priority      integer     NOT NULL DEFAULT 100,
        trigger       text        NOT NULL DEFAULT 'sweep',
        requested_at  timestamptz NOT NULL DEFAULT now(),
        claimed_at    timestamptz,
        claimed_by    text,
        deadline_at   timestamptz,
        heartbeat_at  timestamptz,
        finished_at   timestamptz,
        attempts      integer     NOT NULL DEFAULT 0,
        ok            boolean,
        outcome       text,
        detail        text,
        exit_code     integer,
        signal        text
      )
    `)
    await execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_one_waiting_per_job
         ON sync_queue (job_id) WHERE state = 'queued'`,
    )
    await execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_one_running_per_job
         ON sync_queue (job_id) WHERE state = 'running'`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS sync_queue_claim_order
         ON sync_queue (state, priority, requested_at)`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS sync_queue_recent
         ON sync_queue (requested_at DESC)`,
    )
  })().catch((err) => {
    ensured = null
    throw err
  })
  return ensured
}

type SyncQueueRow = {
  id: string | number
  job_id: string
  payload: unknown
  state: string
  priority: number
  trigger: string
  requested_at: Date | string
  claimed_at: Date | string | null
  claimed_by: string | null
  deadline_at: Date | string | null
  heartbeat_at: Date | string | null
  finished_at: Date | string | null
  attempts: number
  ok: boolean | null
  outcome: string | null
  detail: string | null
  exit_code: number | null
  signal: string | null
}

function iso(value: Date | string | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function mapRow(row: SyncQueueRow): SyncQueueItem {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    state: row.state as SyncQueueState,
    priority: Number(row.priority ?? 0),
    trigger: row.trigger,
    requestedAt: iso(row.requested_at) ?? new Date(0).toISOString(),
    claimedAt: iso(row.claimed_at),
    claimedBy: row.claimed_by,
    deadlineAt: iso(row.deadline_at),
    heartbeatAt: iso(row.heartbeat_at),
    finishedAt: iso(row.finished_at),
    attempts: Number(row.attempts ?? 0),
    ok: row.ok,
    outcome: (row.outcome as SyncQueueOutcome | null) ?? null,
    detail: row.detail,
    exitCode: row.exit_code == null ? null : Number(row.exit_code),
    signal: row.signal,
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
  }
}

const SELECT_COLUMNS = `id, job_id, payload, state, priority, trigger,
  requested_at, claimed_at, claimed_by, deadline_at, heartbeat_at, finished_at,
  attempts, ok, outcome, detail, exit_code, signal`

export type EnqueueSyncJobResult = {
  ok: boolean
  /** A new row was written. */
  enqueued: boolean
  /** Someone had already asked and nobody has started it yet. */
  alreadyQueued: boolean
  /** A child is working on it right now. */
  alreadyRunning: boolean
  /** Held back by the post-failure cooldown. */
  coolingDown: boolean
  item: SyncQueueItem | null
  reason: string | null
}

export async function enqueueSyncJob(input: {
  jobId: string
  trigger: string
  priority?: number
  payload?: Record<string, unknown>
  requestedAt?: string
  /** Skip the post-failure cooldown (an operator pressing Sync now). */
  ignoreCooldown?: boolean
}): Promise<EnqueueSyncJobResult> {
  await ensureSyncQueueTable()

  const existing = await queryOne<SyncQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM sync_queue
      WHERE job_id = $1 AND state IN ('queued', 'running')
      ORDER BY CASE state WHEN 'running' THEN 0 ELSE 1 END
      LIMIT 1`,
    [input.jobId],
  )
  if (existing) {
    const item = mapRow(existing)
    return {
      ok: true,
      enqueued: false,
      alreadyQueued: item.state === 'queued',
      alreadyRunning: item.state === 'running',
      coolingDown: false,
      item,
      reason:
        item.state === 'running'
          ? 'already running'
          : 'already queued — one waiting request per job',
    }
  }

  if (input.ignoreCooldown !== true) {
    const cooldown = await readSyncQueueCooldown(input.jobId)
    if (cooldown) {
      return {
        ok: true,
        enqueued: false,
        alreadyQueued: false,
        alreadyRunning: false,
        coolingDown: true,
        item: null,
        reason: cooldown,
      }
    }
  }

  try {
    const row = await queryOne<SyncQueueRow>(
      `INSERT INTO sync_queue (job_id, payload, trigger, priority, requested_at)
       VALUES ($1, $2::jsonb, $3, $4, COALESCE($5::timestamptz, now()))
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.jobId,
        JSON.stringify(input.payload ?? {}),
        input.trigger,
        input.priority ?? SYNC_QUEUE_PRIORITY_SWEEP,
        input.requestedAt ?? null,
      ],
    )
    return {
      ok: true,
      enqueued: row != null,
      alreadyQueued: false,
      alreadyRunning: false,
      coolingDown: false,
      item: row ? mapRow(row) : null,
      reason: null,
    }
  } catch (err) {
    // Lost the race against another enqueuer — the unique index did its job.
    const message = err instanceof Error ? err.message : String(err)
    if (/sync_queue_one_waiting_per_job/.test(message)) {
      return {
        ok: true,
        enqueued: false,
        alreadyQueued: true,
        alreadyRunning: false,
        coolingDown: false,
        item: null,
        reason: 'already queued — one waiting request per job',
      }
    }
    throw err
  }
}

/**
 * Why this job is being held back, or null when it is free to queue.
 *
 * Only kills and crashes cool down. An honest `failed` (RETS said no, 0 rows)
 * should retry on the next slot like it always did.
 */
async function readSyncQueueCooldown(jobId: string): Promise<string | null> {
  const row = await queryOne<{ outcome: string | null; finished_at: Date | string }>(
    `SELECT outcome, finished_at FROM sync_queue
      WHERE job_id = $1 AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1`,
    [jobId],
  )
  if (!row) return null
  if (row.outcome !== 'timeout' && row.outcome !== 'crashed') return null
  const finishedMs = Date.parse(iso(row.finished_at) ?? '')
  if (!Number.isFinite(finishedMs)) return null
  const waitedMs = Date.now() - finishedMs
  if (waitedMs >= SYNC_QUEUE_FAILURE_COOLDOWN_MS) return null
  const remainingMin = Math.ceil(
    (SYNC_QUEUE_FAILURE_COOLDOWN_MS - waitedMs) / 60_000,
  )
  return `cooling down after a ${row.outcome} run — retries in ~${remainingMin}m`
}

/**
 * Take the next waiting job, oldest-first within a priority band.
 *
 * `SKIP LOCKED` means a second runner polling the same table walks past a row
 * another one is claiming rather than blocking on it.
 */
export async function claimNextSyncJob(input: {
  runner: string
  jobIds: readonly string[]
  budgetMsForJob: (jobId: string) => number
}): Promise<SyncQueueItem | null> {
  await ensureSyncQueueTable()
  if (input.jobIds.length === 0) return null

  return withTransaction(async (client) => {
    const picked = await client.query<{ id: string; job_id: string }>(
      `SELECT id, job_id FROM sync_queue
        WHERE state = 'queued'
          AND job_id = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1 FROM sync_queue running
             WHERE running.state = 'running'
               AND running.job_id = sync_queue.job_id
          )
        ORDER BY priority ASC, requested_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [[...input.jobIds]],
    )
    const row = picked.rows[0]
    if (!row) return null

    const budgetMs = Math.max(60_000, input.budgetMsForJob(row.job_id))
    const claimed = await client.query<SyncQueueRow>(
      `UPDATE sync_queue
          SET state = 'running',
              claimed_at = now(),
              claimed_by = $2,
              heartbeat_at = now(),
              deadline_at = now() + ($3::bigint * interval '1 millisecond'),
              attempts = attempts + 1
        WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [row.id, input.runner, String(budgetMs)],
    )
    const updated = claimed.rows[0]
    return updated ? mapRow(updated) : null
  })
}

export async function heartbeatSyncQueueItem(id: number): Promise<void> {
  await execute(
    `UPDATE sync_queue SET heartbeat_at = now() WHERE id = $1 AND state = 'running'`,
    [id],
  )
}

export async function finishSyncQueueItem(
  id: number,
  result: {
    ok: boolean
    outcome: SyncQueueOutcome
    detail?: string | null
    exitCode?: number | null
    signal?: string | null
  },
): Promise<void> {
  await execute(
    `UPDATE sync_queue
        SET state = $2,
            finished_at = now(),
            heartbeat_at = now(),
            ok = $3,
            outcome = $4,
            detail = $5,
            exit_code = $6,
            signal = $7
      WHERE id = $1`,
    [
      id,
      result.ok ? 'done' : 'failed',
      result.ok,
      result.outcome,
      result.detail?.slice(0, 2000) ?? null,
      result.exitCode ?? null,
      result.signal ?? null,
    ],
  )
}

/**
 * Close out rows whose runner disappeared.
 *
 * A container OOM kills the parent mid-run, so nothing writes the outcome. That
 * row would otherwise sit at `running` forever and the unique index would block
 * the job from ever queueing again — the exact wedge the in-memory flags had,
 * just with a longer memory.
 */
export async function reapAbandonedSyncQueueItems(): Promise<number> {
  await ensureSyncQueueTable()
  return execute(
    `UPDATE sync_queue
        SET state = 'failed',
            finished_at = now(),
            ok = false,
            outcome = 'crashed',
            detail = COALESCE(detail, 'runner stopped reporting — reaped')
      WHERE state = 'running'
        AND COALESCE(heartbeat_at, claimed_at, requested_at)
            < now() - ($1::bigint * interval '1 millisecond')`,
    [String(SYNC_QUEUE_HEARTBEAT_STALE_MS)],
  )
}

export async function pruneSyncQueueHistory(): Promise<number> {
  return execute(
    `DELETE FROM sync_queue
      WHERE state IN ('done', 'failed')
        AND finished_at < now() - ($1::bigint * interval '1 millisecond')`,
    [String(SYNC_QUEUE_RETENTION_MS)],
  )
}

export async function cancelSyncQueueItem(
  id: number,
): Promise<{ cancelled: boolean; reason: string | null }> {
  await ensureSyncQueueTable()
  const row = await queryOne<{ state: string }>(
    `SELECT state FROM sync_queue WHERE id = $1`,
    [id],
  )
  if (!row) return { cancelled: false, reason: 'no such queue item' }
  if (row.state === 'running') {
    // The runner owns the child; killing it from here would leave the process
    // alive with nothing watching. Mark the intent and let the runner act.
    await execute(
      `UPDATE sync_queue SET detail = 'cancel requested by admin' WHERE id = $1`,
      [id],
    )
    return {
      cancelled: false,
      reason: 'already running — it will be killed at its deadline',
    }
  }
  if (row.state !== 'queued') {
    return { cancelled: false, reason: 'already finished' }
  }
  await execute(
    `UPDATE sync_queue
        SET state = 'failed', finished_at = now(), ok = false,
            outcome = 'cancelled', detail = 'cancelled from Admin before it started'
      WHERE id = $1 AND state = 'queued'`,
    [id],
  )
  return { cancelled: true, reason: null }
}

/** Drop every waiting row for a job (Dashboard "Clear" on that row). */
export async function clearSyncQueueForJob(jobId: string): Promise<number> {
  await ensureSyncQueueTable()
  return execute(
    `UPDATE sync_queue
        SET state = 'failed', finished_at = now(), ok = false,
            outcome = 'cancelled', detail = 'cleared from Admin'
      WHERE job_id = $1 AND state = 'queued'`,
    [jobId],
  )
}

export async function readSyncQueueSnapshot(
  recentLimit = 12,
): Promise<SyncQueueSnapshot> {
  try {
    await ensureSyncQueueTable()
    await reapAbandonedSyncQueueItems()
    const [liveRows, recentRows] = await Promise.all([
      query<SyncQueueRow>(
        `SELECT ${SELECT_COLUMNS} FROM sync_queue
          WHERE state IN ('queued', 'running')
          ORDER BY priority ASC, requested_at ASC`,
      ),
      query<SyncQueueRow>(
        `SELECT ${SELECT_COLUMNS} FROM sync_queue
          WHERE state IN ('done', 'failed')
          ORDER BY finished_at DESC NULLS LAST
          LIMIT $1`,
        [recentLimit],
      ),
    ])
    const live = liveRows.map(mapRow)
    const { getSyncMeta } = await import('@/lib/db/sync-meta')
    const runnerHeartbeatAt = await getSyncMeta('last_mls_sync_heartbeat').catch(
      () => null,
    )
    const beatMs = runnerHeartbeatAt ? Date.parse(runnerHeartbeatAt) : Number.NaN
    return {
      waiting: live.filter((item) => item.state === 'queued'),
      running: live.filter((item) => item.state === 'running'),
      recent: recentRows.map(mapRow),
      runnerHeartbeatAt,
      runnerStale:
        !Number.isFinite(beatMs) ||
        Date.now() - beatMs > SYNC_QUEUE_RUNNER_STALE_MS,
    }
  } catch (err) {
    console.warn('[sync-queue] snapshot failed', err)
    return emptySyncQueueSnapshot()
  }
}

/**
 * True when a queued job has been waiting long enough, with no live runner, that
 * another host should pick it up.
 *
 * This is the replacement for the Configure scheduler radio: instead of an
 * operator flipping a job back to Netlify when Railway is down, the Netlify
 * scheduled function notices the queue is stranded and runs the job itself.
 */
export async function readStrandedSyncQueueItem(
  jobId: string,
  graceMs: number,
): Promise<SyncQueueItem | null> {
  await ensureSyncQueueTable()
  await reapAbandonedSyncQueueItems()
  const row = await queryOne<SyncQueueRow>(
    `SELECT ${SELECT_COLUMNS} FROM sync_queue
      WHERE job_id = $1
        AND state = 'queued'
        AND requested_at < now() - ($2::bigint * interval '1 millisecond')
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue running
           WHERE running.state = 'running' AND running.job_id = sync_queue.job_id
        )
      ORDER BY requested_at ASC
      LIMIT 1`,
    [jobId, String(Math.max(0, graceMs))],
  )
  return row ? mapRow(row) : null
}

/**
 * Note: the Netlify rescue path deliberately does *not* claim the row it is
 * about to run — it clears it (`clearSyncQueueForJob`) and runs the job with
 * nothing on the queue. A serverless function cannot heartbeat for the length
 * of a pull, so a row left at `running` on its behalf would be reaped as
 * `crashed` after five minutes and free the unique index for a duplicate.
 */
