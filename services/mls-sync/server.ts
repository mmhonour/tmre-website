/**
 * Railway mls-sync — always-on RETS → Neon Incremental puller.
 *
 * Netlify is not in the pull path. This process:
 *   - schedules pulls every MLS_SYNC_INTERVAL_MS (default 30m)
 *   - accepts POST /run (Bearer SYNC_CRON_SECRET) for Admin Sync now
 *   - stamps last_incremental_sync / heartbeat in Neon
 *   - owns the stats_cache rebuild: self-scheduled sweep + POST /stats. A full
 *     rebuild takes minutes, so no Netlify function can host it, and Netlify is
 *     refusing background invocations for the site (HTTP 429).
 *
 * Start (repo root):
 *   npm run start:mls-sync
 *
 * Env: DATABASE_URL, RETS_*, SYNC_CRON_SECRET, PORT, optional MLS_SYNC_INTERVAL_MS
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'

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

/** Stats sweep cadence — cheap staleness check, rebuild only when past TTL. */
const STATS_SWEEP_MS = 10 * 60 * 1000
const STATS_SWEEP_DELAY_MS = 2 * 60 * 1000

let runInFlight: Promise<void> | null = null
let lastRunStartedAt: string | null = null
let lastRunFinishedAt: string | null = null
let lastRunOk: boolean | null = null
let lastRunError: string | null = null

let statsInFlight: Promise<void> | null = null
let lastStatsStartedAt: string | null = null
let lastStatsFinishedAt: string | null = null
let lastStatsOk: boolean | null = null
let lastStatsWritten: number | null = null
let lastStatsError: string | null = null

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

async function executeIncremental(options: {
  startedAt: string
  source: 'admin' | 'railway' | 'watchdog'
  towns?: string[]
  statusScope?: 'all' | 'active' | 'closed'
}): Promise<void> {
  const { hydrateSyncMetaStore } = await import('../../lib/db/sync-meta-store')
  const { runIncrementalSyncListingsWork } = await import(
    '../../lib/netlify-sync-listings-work'
  )

  await hydrateSyncMetaStore()
  await stampHeartbeat(options.startedAt)
  // Keep Neon heartbeat fresh during long RETS pulls so Admin does not flash
  // BROKEN while the run is still in flight (idle pulse is paused then).
  const pulse = setInterval(() => {
    void stampHeartbeat(new Date().toISOString()).catch((err) => {
      console.warn('[mls-sync] heartbeat pulse failed', err)
    })
  }, 60_000)

  try {
    const result = await runIncrementalSyncListingsWork(options.startedAt, {
      source: options.source,
      ...(options.towns?.length ? { towns: options.towns } : {}),
      ...(options.statusScope && options.statusScope !== 'all'
        ? { statusScope: options.statusScope }
        : {}),
    })

    lastRunFinishedAt = new Date().toISOString()
    lastRunOk = result.status >= 200 && result.status < 300
    lastRunError = lastRunOk
      ? null
      : typeof result.body?.reason === 'string'
        ? result.body.reason
        : `HTTP ${result.status}`

    await stampHeartbeat(lastRunFinishedAt)
    console.info(
      `[mls-sync] run finished ok=${lastRunOk} status=${result.status} at=${lastRunFinishedAt}`,
    )
  } finally {
    clearInterval(pulse)
  }
}

function startRun(options: {
  startedAt: string
  source: 'admin' | 'railway' | 'watchdog'
  towns?: string[]
  statusScope?: 'all' | 'active' | 'closed'
}): { accepted: boolean; alreadyRunning: boolean } {
  if (runInFlight) {
    return { accepted: true, alreadyRunning: true }
  }
  lastRunStartedAt = options.startedAt
  lastRunFinishedAt = null
  lastRunOk = null
  lastRunError = null
  runInFlight = executeIncremental(options)
    .catch((err) => {
      lastRunFinishedAt = new Date().toISOString()
      lastRunOk = false
      lastRunError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] run failed', err)
      void stampHeartbeat(lastRunFinishedAt).catch(() => {})
    })
    .finally(() => {
      runInFlight = null
    })
  return { accepted: true, alreadyRunning: false }
}

/**
 * Full stats_cache rebuild, hosted here.
 *
 * A rebuild reads every town's Active/Closed/Expired inventory and rewrites ~570
 * payloads; it does not fit a Netlify scheduled function (seconds) and Netlify
 * is refusing background invocations for the site (HTTP 429), so no serverless
 * slot can finish one. This process is always on, which makes it the only host
 * that can. `force` steals the rebuild lock a frozen Lambda may have left armed.
 */
async function executeStatsRebuild(startedAt: string): Promise<void> {
  const { hydrateSyncMetaStore } = await import('../../lib/db/sync-meta-store')
  const { rebuildStatsCache } = await import('../../lib/stats-cache')
  const { recordDashboardSyncAudit } = await import('../../lib/db/listings-repo')

  await hydrateSyncMetaStore()
  const result = await rebuildStatsCache({ trackRefresh: true, force: true })
  const finishedAt = new Date().toISOString()
  const ok = result.skipped !== true && result.written > 0

  lastStatsFinishedAt = finishedAt
  lastStatsOk = ok
  lastStatsWritten = result.written
  lastStatsError = ok ? null : (result.skipReason ?? 'wrote 0 entries')

  console.info(
    `[mls-sync] stats rebuild written=${result.written} skipped=${result.skipped ?? false} reason=${result.skipReason ?? '—'} in ${result.durationMs}ms`,
  )

  // Sync History needs the Done|Failed row — nothing else writes it for stats.
  await recordDashboardSyncAudit({
    startedAt,
    finishedAt,
    syncSuffix: 'stats',
    listingsCount: result.written,
    ok,
    detail: result.skipped
      ? `Stats cache skipped — ${result.skipReason ?? 'unknown'}`
      : ok
        ? `Stats cache rebuilt on Railway — ${result.written.toLocaleString()} entries`
        : 'Stats cache rebuilt — 0 entries (check listings inventory / Neon)',
  })
}

/**
 * Never overlap a rebuild with a RETS pull: holding both towns' inventory and
 * the stats payloads in one heap is what OOM-killed this service before.
 */
function startStatsRebuild(startedAt: string): {
  accepted: boolean
  alreadyRunning: boolean
  incrementalInFlight: boolean
} {
  if (statsInFlight) {
    return { accepted: false, alreadyRunning: true, incrementalInFlight: false }
  }
  if (runInFlight) {
    return { accepted: false, alreadyRunning: false, incrementalInFlight: true }
  }

  lastStatsStartedAt = startedAt
  lastStatsFinishedAt = null
  lastStatsOk = null
  lastStatsError = null
  lastStatsWritten = null
  statsInFlight = executeStatsRebuild(startedAt)
    .catch((err) => {
      lastStatsFinishedAt = new Date().toISOString()
      lastStatsOk = false
      lastStatsError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] stats rebuild failed', err)
    })
    .finally(() => {
      statsInFlight = null
    })
  return { accepted: true, alreadyRunning: false, incrementalInFlight: false }
}

/**
 * Is a stats rebuild due? Mirrors the stale check the Netlify cron used to make,
 * and still honours the Admin pause toggle so Configure keeps working.
 */
async function statsRebuildIsDue(): Promise<boolean> {
  // Configure decides the host. If it says Netlify, this process stays out.
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { resolveJobScheduler } = await import(
    '../../lib/sync-schedule-config-shared'
  )
  const config = await readSyncScheduleConfigFresh()
  if (resolveJobScheduler(config.jobs['stats-cache']) !== 'railway') return false

  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  if (await isScheduledSyncJobPausedFresh('stats-cache')) return false

  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const { STATS_CACHE_TTL_MS } = await import('../../lib/stats-cache')
  const last = await getSyncMeta('last_stats_cache')
  const lastMs = last ? Date.parse(last) : Number.NaN
  if (!Number.isFinite(lastMs)) return true
  return Date.now() - lastMs >= STATS_CACHE_TTL_MS
}

/**
 * Self-scheduled stats sweep.
 *
 * Deliberately not dependent on a Netlify cron reaching us: the thin crons can
 * only ask, and their background-worker hop is being refused site-wide. This
 * process already owns its own pull interval, so it owns the stats clock too.
 */
function scheduleStatsSweep(): void {
  const tick = async () => {
    if (runInFlight || statsInFlight) return
    if (!(await statsRebuildIsDue())) return
    console.info('[mls-sync] stats cache is stale — starting rebuild')
    startStatsRebuild(new Date().toISOString())
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] stats sweep failed', err)
    })
  }
  setTimeout(run, STATS_SWEEP_DELAY_MS)
  setInterval(run, STATS_SWEEP_MS)
  console.info(
    `[mls-sync] stats sweep every ${Math.round(STATS_SWEEP_MS / 60_000)}m (rebuild when last_stats_cache is past TTL)`,
  )
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    const { getSyncMeta } = await import('../../lib/db/sync-meta')
    const end = await getSyncMeta('last_incremental_sync')
    const start = await getSyncMeta('last_incremental_sync_started')
    const heartbeat = await getSyncMeta('last_mls_sync_heartbeat')
    sendJson(res, 200, {
      ok: true,
      service: 'mls-sync',
      host: 'railway',
      intervalMs: INTERVAL_MS,
      inFlight: runInFlight != null,
      lastRunStartedAt,
      lastRunFinishedAt,
      lastRunOk,
      lastRunError,
      stats: {
        inFlight: statsInFlight != null,
        lastStatsStartedAt,
        lastStatsFinishedAt,
        lastStatsOk,
        lastStatsWritten,
        lastStatsError,
        last_stats_cache: await getSyncMeta('last_stats_cache'),
      },
      neon: {
        last_incremental_sync: end,
        last_incremental_sync_started: start,
        last_mls_sync_heartbeat: heartbeat,
      },
    })
    return
  }

  if (req.method === 'POST' && path === '/run') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const startedAt =
      typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
        ? body.startedAt
        : new Date().toISOString()
    const source =
      body.source === 'admin' || body.source === 'watchdog'
        ? body.source
        : 'railway'
    const towns = Array.isArray(body.towns)
      ? body.towns.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : undefined
    const statusScope =
      body.statusScope === 'active' || body.statusScope === 'closed'
        ? body.statusScope
        : undefined

    const { alreadyRunning } = startRun({
      startedAt,
      source,
      ...(towns?.length ? { towns } : {}),
      ...(statusScope ? { statusScope } : {}),
    })

    sendJson(res, 202, {
      ok: true,
      accepted: true,
      alreadyRunning,
      startedAt,
      message: alreadyRunning
        ? 'Incremental already running on mls-sync'
        : 'Incremental accepted on mls-sync (Railway)',
    })
    return
  }

  if (req.method === 'POST' && path === '/stats') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const startedAt =
      typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
        ? body.startedAt
        : new Date().toISOString()

    const started = startStatsRebuild(startedAt)
    if (started.incrementalInFlight) {
      // 409 reads as "accepted, already busy" to the caller — next tick retries.
      sendJson(res, 409, {
        ok: true,
        accepted: false,
        incrementalInFlight: true,
        message: 'Incremental pull in flight — stats rebuild deferred to next tick',
      })
      return
    }

    sendJson(res, 202, {
      ok: true,
      accepted: started.accepted,
      alreadyRunning: started.alreadyRunning,
      startedAt,
      message: started.alreadyRunning
        ? 'Stats rebuild already running on mls-sync'
        : 'Stats rebuild accepted on mls-sync (Railway)',
    })
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
    `[mls-sync] listening on :${PORT} · interval ${Math.round(INTERVAL_MS / 60_000)}m · RETS→Neon (no Netlify pull)`,
  )
  // First pull shortly after boot (don’t wait a full interval).
  const bootAt = new Date().toISOString()
  startRun({ startedAt: bootAt, source: 'railway' })
  setInterval(() => {
    startRun({ startedAt: new Date().toISOString(), source: 'railway' })
  }, INTERVAL_MS)
  // Process-alive signal between pulls. In-run pulse already stamps ~60s;
  // skip while a pull is in flight so we do not double-write.
  setInterval(() => {
    if (runInFlight) return
    void stampHeartbeat(new Date().toISOString()).catch((err) => {
      console.warn('[mls-sync] idle heartbeat failed', err)
    })
  }, 60_000)
  scheduleStatsSweep()
})
