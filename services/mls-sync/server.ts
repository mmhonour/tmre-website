/**
 * Railway mls-sync — the always-on sync runner.
 *
 * This process does two things and nothing else:
 *   1. Sweeps: notice a job's Configure slot has come round and put a row on
 *      `sync_queue`.
 *   2. Drain: claim the next queued row, fork a child to do the work under a
 *      kill budget, and write the outcome back.
 *
 * No job runs in this heap. Holding two towns' inventory at once is what
 * OOM-killed this container, and an OOM took the in-memory queue with it — five
 * `pending*` variables that nobody could see and a restart silently emptied.
 * Now the waiting line is a table, and a job that blows up blows up alone.
 *
 * There is no per-job Scheduler radio any more either. The queue is the
 * handoff: Admin, the Netlify crons, EventBridge and these sweeps all enqueue,
 * this process claims, and Netlify only runs a job itself when a row has been
 * stranded long enough to prove this process is gone.
 *
 * Start (repo root):
 *   npm run start:mls-sync
 *
 * Env: DATABASE_URL, RETS_*, SYNC_CRON_SECRET, PORT,
 *      optional MLS_SYNC_INTERVAL_MS, MLS_SYNC_CHILD_MAX_OLD_SPACE_MB
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'

import {
  SYNC_QUEUE_PRIORITY_MANUAL,
  SYNC_QUEUE_PRIORITY_SWEEP,
  SYNC_QUEUE_RUNNER_JOBS,
} from '../../lib/sync-queue-shared'
import type { ScheduledSyncJobId } from '../../lib/scheduled-sync-jobs-shared'
import {
  drainSyncQueueOnce,
  readRunnerState,
  startSyncQueueDrain,
  stopCurrentChild,
} from './job-runner'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

/**
 * Marks this process as the RETS→Neon puller, whoever asked for the run. The
 * sync work reads it to keep site-cache warm (deal board / latest / heroes /
 * stats) out of here entirely — that warm is what Node-OOMed this service.
 */
process.env.MLS_SYNC_SERVICE = '1'

const PORT = Number(process.env.PORT ?? '8080')
const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.MLS_SYNC_INTERVAL_MS ?? String(30 * 60 * 1000)) ||
    30 * 60_000,
)

/**
 * Sweep cadences. A sweep only *checks* and enqueues — the drain decides when
 * the work actually starts, and Configure's Start time is the wall-clock grid
 * that decides whether a run is allowed at all. Boot delays are staggered so a
 * deploy does not put six rows on the queue in the same second.
 */
const SWEEPS: {
  jobId: ScheduledSyncJobId
  everyMs: number
  bootDelayMs: number
  label: string
}[] = [
  { jobId: 'incremental', everyMs: 60_000, bootDelayMs: 15_000, label: 'incremental' },
  {
    jobId: 'stats-cache',
    everyMs: 10 * 60_000,
    bootDelayMs: 2 * 60_000,
    label: 'stats cache',
  },
  {
    jobId: 'listing-scores',
    everyMs: 5 * 60_000,
    bootDelayMs: 3 * 60_000,
    label: 'goldilocks',
  },
  {
    jobId: 'deal-of-the-day',
    everyMs: 10 * 60_000,
    bootDelayMs: 4 * 60_000,
    label: 'deal of the day',
  },
  {
    jobId: 'property-addresses',
    everyMs: 10 * 60_000,
    bootDelayMs: 5 * 60_000,
    label: 'property addresses',
  },
  {
    jobId: 'market-digest',
    everyMs: 5 * 60_000,
    bootDelayMs: 6 * 60_000,
    label: 'market digest',
  },
]

function readBearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization?.trim() ?? ''
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim()
  return null
}

function assertAuth(req: IncomingMessage): boolean {
  const secret = process.env.SYNC_CRON_SECRET?.trim()
  if (!secret) return false
  const q = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const fromQuery = q.searchParams.get('secret')?.trim()
  const bearer = readBearer(req)
  return bearer === secret || fromQuery === secret
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function stampHeartbeat(at: string): Promise<void> {
  const { setSyncMetaDurable } = await import('../../lib/db/sync-meta-store')
  await setSyncMetaDurable('last_mls_sync_heartbeat', at)
}

/**
 * Common gates before a sweep enqueues: Pause, the Admin Next override, and
 * Configure's Frequency/Start grid.
 *
 * There is no restart guard here any more. `sync_queue` records how the last
 * attempt ended and refuses to re-queue a job for 30 minutes after a timeout or
 * a crash, which is the same protection the old `last_*_started` stamps gave —
 * except it also covers the honest failures and it says so in Admin.
 */
async function jobIsDue(jobId: ScheduledSyncJobId): Promise<boolean> {
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  const { shouldDeferScheduledJob } = await import('../../lib/sync-next-override')
  const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const { lastFinishedMetaKey } = await import('../../lib/sync-schedule-config')

  if (await isScheduledSyncJobPausedFresh(jobId)) return false
  if (shouldDeferScheduledJob(jobId)) return false

  const config = await readSyncScheduleConfigFresh()
  const lastFinishedAt = await getSyncMeta(lastFinishedMetaKey(jobId))
  return isJobDueBySchedule(config.jobs[jobId], lastFinishedAt)
}

/** Extra per-job conditions on top of the schedule grid. */
async function jobHasWork(jobId: ScheduledSyncJobId): Promise<boolean> {
  if (jobId === 'stats-cache') {
    // Dirtiness decides whether there is work; the slot decides when we may do
    // it. The old hourly TTL recomputed all seven towns whether or not a number
    // had moved.
    const { statsTownsDueForRebuild } = await import(
      '../../lib/stats-dirty-towns'
    )
    const { towns } = await statsTownsDueForRebuild()
    return towns.length > 0
  }
  if (jobId === 'market-digest') {
    const { isMarketDigestAlreadySentThisWeek } = await import(
      '../../lib/market-digest-config'
    )
    return !(await isMarketDigestAlreadySentThisWeek())
  }
  return true
}

/**
 * Incremental has a liveness backstop the others do not need: stale listings are
 * the one outcome worse than an off-minute pull, so if the config read wedges or
 * the grid ever misfires, pull anyway once End is older than twice the interval.
 */
async function incrementalLivenessOverride(): Promise<boolean> {
  try {
    const { getSyncMeta } = await import('../../lib/db/sync-meta')
    const finishedAt = await getSyncMeta('last_incremental_sync')
    const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
    return !Number.isFinite(finishedMs) || Date.now() - finishedMs >= INTERVAL_MS * 2
  } catch {
    return false
  }
}

async function sweepTick(jobId: ScheduledSyncJobId, label: string): Promise<void> {
  const { enqueueSyncJob } = await import('../../lib/sync-queue')

  let due = false
  try {
    due = await jobIsDue(jobId)
  } catch (err) {
    if (jobId !== 'incremental') throw err
    console.warn('[mls-sync] schedule read failed — falling back to liveness', err)
    due = await incrementalLivenessOverride()
  }
  if (!due) return
  if (!(await jobHasWork(jobId))) return

  const enqueued = await enqueueSyncJob({
    jobId,
    trigger: 'railway-sweep',
    priority: SYNC_QUEUE_PRIORITY_SWEEP,
    ...(jobId === 'market-digest' ? { payload: { force: false } } : {}),
  })
  if (enqueued.enqueued) {
    console.info(`[mls-sync] ${label} due — queued`)
  } else if (enqueued.coolingDown) {
    console.warn(`[mls-sync] ${label} due but held: ${enqueued.reason}`)
  }
}

function scheduleSweeps(): void {
  for (const sweep of SWEEPS) {
    const run = () => {
      void sweepTick(sweep.jobId, sweep.label).catch((err) => {
        console.warn(`[mls-sync] ${sweep.label} sweep failed`, err)
      })
    }
    setTimeout(run, sweep.bootDelayMs)
    setInterval(run, sweep.everyMs)
  }
  console.info(
    `[mls-sync] sweeps armed: ${SWEEPS.map(
      (s) => `${s.label} every ${Math.round(s.everyMs / 60_000) || 1}m`,
    ).join(' · ')}`,
  )
  // Said at boot, not at 08:00 on the one morning of the week that matters.
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error(
      '[mls-sync] RESEND_API_KEY is not set on this service — every Monday brief claimed off the queue here will skip with "RESEND_API_KEY not set"',
    )
  }
}

/**
 * Enqueue from an HTTP request (Admin Sync now, the watchdog, a manual curl).
 * Manual priority, and past the failure cooldown: somebody pressed the button
 * because they did not believe the cooldown.
 */
async function enqueueFromRequest(
  jobId: ScheduledSyncJobId,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { enqueueSyncJob } = await import('../../lib/sync-queue')
  const startedAt =
    typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
      ? body.startedAt
      : new Date().toISOString()

  const towns = Array.isArray(body.towns)
    ? body.towns.filter(
        (t): t is string => typeof t === 'string' && t.trim().length > 0,
      )
    : undefined
  const statusScope =
    body.statusScope === 'active' || body.statusScope === 'closed'
      ? body.statusScope
      : undefined

  const payload: Record<string, unknown> = {}
  if (jobId === 'incremental') {
    if (towns?.length) payload.towns = towns
    if (statusScope) payload.statusScope = statusScope
  }
  if (jobId === 'market-digest') {
    payload.force = body.force === false ? false : true
  }

  const enqueued = await enqueueSyncJob({
    jobId,
    trigger: typeof body.source === 'string' ? body.source : 'manual',
    priority: SYNC_QUEUE_PRIORITY_MANUAL,
    requestedAt: startedAt,
    payload,
    ignoreCooldown: true,
  })

  // Do not make the caller wait a poll interval for something they asked for.
  void drainSyncQueueOnce().catch(() => {})

  return {
    ok: enqueued.ok,
    accepted: enqueued.ok,
    jobId,
    startedAt,
    queued: enqueued.enqueued,
    alreadyQueued: enqueued.alreadyQueued,
    alreadyRunning: enqueued.alreadyRunning,
    queueId: enqueued.item?.id ?? null,
    message: enqueued.enqueued
      ? `${jobId} queued on the sync runner`
      : (enqueued.reason ?? `${jobId} was already on the queue`),
  }
}

/** Legacy per-job endpoints, kept so an old caller still reaches the queue. */
const LEGACY_ENDPOINTS: Record<string, ScheduledSyncJobId> = {
  '/run': 'incremental',
  '/stats': 'stats-cache',
  '/scores': 'listing-scores',
  '/deal-of-the-day': 'deal-of-the-day',
  '/property-addresses': 'property-addresses',
  '/market-digest': 'market-digest',
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    const { getSyncMeta } = await import('../../lib/db/sync-meta')
    const { readSyncQueueSnapshot } = await import('../../lib/sync-queue')
    const runner = readRunnerState()
    const queue = await readSyncQueueSnapshot(8)
    sendJson(res, 200, {
      ok: true,
      service: 'mls-sync',
      host: 'railway',
      role: 'sync-queue runner',
      intervalMs: INTERVAL_MS,
      claims: SYNC_QUEUE_RUNNER_JOBS,
      childHeapCapMb: process.env.MLS_SYNC_CHILD_MAX_OLD_SPACE_MB ?? null,
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      runner: {
        busy: runner.current != null,
        currentJob: runner.current?.jobId ?? null,
        currentQueueId: runner.current?.id ?? null,
        deadlineAt: runner.current?.deadlineAt ?? null,
        childPid: runner.childPid,
        childStartedAt: runner.childStartedAt,
        lastOutcome: runner.lastOutcome,
      },
      queue: {
        drainHeartbeatAt: queue.drainHeartbeatAt,
        runnerStale: queue.runnerStale,
        waiting: queue.waiting.map((item) => ({
          id: item.id,
          jobId: item.jobId,
          trigger: item.trigger,
          requestedAt: item.requestedAt,
        })),
        running: queue.running.map((item) => ({
          id: item.id,
          jobId: item.jobId,
          claimedBy: item.claimedBy,
          claimedAt: item.claimedAt,
          deadlineAt: item.deadlineAt,
        })),
        recent: queue.recent.map((item) => ({
          id: item.id,
          jobId: item.jobId,
          outcome: item.outcome,
          ok: item.ok,
          finishedAt: item.finishedAt,
          detail: item.detail,
        })),
      },
      neon: {
        last_incremental_sync: await getSyncMeta('last_incremental_sync'),
        last_incremental_sync_started: await getSyncMeta(
          'last_incremental_sync_started',
        ),
        last_mls_sync_heartbeat: await getSyncMeta('last_mls_sync_heartbeat'),
        last_stats_cache: await getSyncMeta('last_stats_cache'),
        last_listing_scores: await getSyncMeta('last_listing_scores'),
        last_deal_of_the_day_cache: await getSyncMeta(
          'last_deal_of_the_day_cache',
        ),
        property_addresses_synced_at: await getSyncMeta(
          'property_addresses_synced_at',
        ),
        market_digest_last_sent_at: await getSyncMeta(
          'market_digest_last_sent_at',
        ),
      },
    })
    return
  }

  if (req.method === 'POST' && path === '/drain') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    await readJson(req)
    void drainSyncQueueOnce().catch(() => {})
    sendJson(res, 202, {
      ok: true,
      accepted: true,
      busy: readRunnerState().current != null,
      message: 'drain poked',
    })
    return
  }

  if (req.method === 'POST' && path === '/enqueue') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const jobId = typeof body.jobId === 'string' ? body.jobId : ''
    if (!(SYNC_QUEUE_RUNNER_JOBS as readonly string[]).includes(jobId)) {
      sendJson(res, 400, {
        ok: false,
        error: `"${jobId}" is not a job this runner claims`,
        claims: SYNC_QUEUE_RUNNER_JOBS,
      })
      return
    }
    sendJson(
      res,
      202,
      await enqueueFromRequest(jobId as ScheduledSyncJobId, body),
    )
    return
  }

  const legacyJob = LEGACY_ENDPOINTS[path]
  if (req.method === 'POST' && legacyJob) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    sendJson(res, 202, await enqueueFromRequest(legacyJob, body))
    return
  }

  sendJson(res, 404, { ok: false, error: 'not found' })
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((err) => {
    console.error('[mls-sync] request error', err)
    if (!res.headersSent) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
})

server.listen(PORT, () => {
  console.info(
    `[mls-sync] listening on :${PORT} · sync-queue runner (interval backstop ${Math.round(INTERVAL_MS / 60_000)}m) · RETS→Neon in forked children`,
  )
  // No boot pull: a deploy must not re-phase the schedule. The sweep queues one
  // within a minute if a slot is already owed.
  scheduleSweeps()
  startSyncQueueDrain()

  // Process-alive signal. Admin and the Netlify rescue path both read this to
  // decide whether this runner still exists, so it must keep beating while a
  // child works — the parent is idle then, which is the whole idea.
  const beat = () => {
    void stampHeartbeat(new Date().toISOString()).catch((err) => {
      console.warn('[mls-sync] heartbeat failed', err)
    })
  }
  beat()
  setInterval(beat, 60_000)

  // Prune terminal queue rows once a day so the table stays a work list.
  setInterval(
    () => {
      void import('../../lib/sync-queue')
        .then(({ pruneSyncQueueHistory }) => pruneSyncQueueHistory())
        .catch(() => {})
    },
    6 * 60 * 60 * 1000,
  )
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.info(`[mls-sync] ${signal} — stopping current child`)
    stopCurrentChild()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 10_000).unref()
  })
}
