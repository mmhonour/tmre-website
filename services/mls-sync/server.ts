/**
 * Railway mls-sync — always-on RETS → Neon Incremental puller.
 *
 * Netlify is not in the pull path. This process:
 *   - schedules pulls every MLS_SYNC_INTERVAL_MS (default 30m)
 *   - accepts POST /run (Bearer SYNC_CRON_SECRET) for Admin Sync now
 *   - stamps last_incremental_sync / heartbeat in Neon
 *   - owns the stats_cache rebuild: self-scheduled dirty-town sweep + POST
 *     /stats. A full rebuild takes minutes, so no Netlify function can host it,
 *     and Netlify is refusing background invocations for the site (HTTP 429).
 *   - owns Goldilocks scores (POST /scores), Deal of the Day (POST
 *     /deal-of-the-day) and the property address directory (POST
 *     /property-addresses) for the same reason: each runs for minutes.
 *
 * Which host owns a job is declared per job in Admin → Configure → Scheduler.
 * The sweeps here honour that radio, so pointing a job back at Netlify cron
 * makes this process stand down without a deploy.
 *
 * Start (repo root):
 *   npm run start:mls-sync
 *
 * Env: DATABASE_URL, RETS_*, SYNC_CRON_SECRET, PORT, optional MLS_SYNC_INTERVAL_MS
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'

import type { StatsRebuildReason } from '../../lib/stats-dirty-towns'
import type { TmreTown } from '../../lib/tmre-towns'

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

/** Stats sweep cadence — one small sync_meta read, rebuild only dirty towns. */
const STATS_SWEEP_MS = 10 * 60 * 1000
const STATS_SWEEP_DELAY_MS = 2 * 60 * 1000

/**
 * Goldilocks sweep cadence. Both sweeps only *check*; Configure's Start time is
 * the wall-clock grid that decides whether a run is allowed, so a tighter check
 * interval just means the job starts nearer its configured minute.
 */
const SCORES_SWEEP_MS = 5 * 60 * 1000
const SCORES_SWEEP_DELAY_MS = 3 * 60 * 1000

/**
 * Deal of the Day and the property-address directory are weekly, so a 10-minute
 * check lands them within ten minutes of their Configure slot. Boot delays are
 * staggered so a deploy does not fire every lane at once into one heap.
 */
const DOTD_SWEEP_MS = 10 * 60 * 1000
const DOTD_SWEEP_DELAY_MS = 4 * 60 * 1000
const ADDRESSES_SWEEP_MS = 10 * 60 * 1000
const ADDRESSES_SWEEP_DELAY_MS = 5 * 60 * 1000

/**
 * Property-address attempt stamp, read only by this service. The dashboard shows
 * that row as a single End timestamp, so the job has no public Start key to
 * compare against — but the restart guard still needs to know an attempt died
 * mid-flight, and an in-process flag does not survive the container going down.
 */
const ADDRESSES_ATTEMPT_KEY = 'property_addresses_railway_attempt'

/**
 * How long to wait before retrying a rebuild whose start never finished. An OOM
 * takes the whole container with it, so without this the sweep would relaunch
 * the same fatal rebuild on every boot and starve the incremental pull.
 */
const STATS_RETRY_COOLDOWN_MS = 30 * 60 * 1000

type StatsRebuildPlan = {
  towns: TmreTown[]
  reasons: Record<string, StatsRebuildReason>
  /** Where the request came from: railway-sweep | manual. */
  trigger: string
}

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
let lastStatsPlan: StatsRebuildPlan | null = null

let scoresInFlight: Promise<void> | null = null
let lastScoresStartedAt: string | null = null
let lastScoresFinishedAt: string | null = null
let lastScoresOk: boolean | null = null
let lastScoresScored: number | null = null
let lastScoresError: string | null = null
let lastScoresTrigger: string | null = null

let dotdInFlight: Promise<void> | null = null
let lastDotdStartedAt: string | null = null
let lastDotdFinishedAt: string | null = null
let lastDotdOk: boolean | null = null
let lastDotdWritten: number | null = null
let lastDotdError: string | null = null
let lastDotdTrigger: string | null = null

let addressesInFlight: Promise<void> | null = null
let lastAddressesStartedAt: string | null = null
let lastAddressesFinishedAt: string | null = null
let lastAddressesOk: boolean | null = null
let lastAddressesRows: number | null = null
let lastAddressesError: string | null = null
let lastAddressesTrigger: string | null = null

/**
 * Every lane in this process shares one heap, and holding two towns' inventory at
 * once is what OOM-killed the container before. One job at a time, whichever
 * asked first; the losing sweep just retries on its next tick.
 */
function anyJobInFlight(): boolean {
  return (
    runInFlight != null ||
    statsInFlight != null ||
    scoresInFlight != null ||
    dotdInFlight != null ||
    addressesInFlight != null
  )
}

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
 * stats_cache rebuild for the towns in `plan`, hosted here.
 *
 * A full rebuild reads every town's Active/Closed/Expired inventory and rewrites
 * ~570 payloads; it does not fit a Netlify scheduled function (seconds) and
 * Netlify is refusing background invocations for the site (HTTP 429), so no
 * serverless slot can finish one. This process is always on, which makes it the
 * only host that can. `force` steals the rebuild lock a frozen Lambda may have
 * left armed.
 */
async function executeStatsRebuild(
  startedAt: string,
  plan: StatsRebuildPlan,
): Promise<void> {
  const { hydrateSyncMetaStore } = await import('../../lib/db/sync-meta-store')
  const { rebuildStatsCacheForTowns } = await import('../../lib/stats-cache')
  const { recordDashboardSyncAudit } = await import('../../lib/db/listings-repo')

  await hydrateSyncMetaStore()
  // Passing every town here lands in the full-cache path (rebuildStatsCache).
  const result = await rebuildStatsCacheForTowns(plan.towns, {
    trackRefresh: true,
    force: true,
    trigger: plan.trigger,
    reasons: plan.reasons,
  })
  const finishedAt = new Date().toISOString()
  const ok = result.skipped !== true && result.written > 0

  lastStatsFinishedAt = finishedAt
  lastStatsOk = ok
  lastStatsWritten = result.written
  lastStatsError = ok ? null : (result.skipReason ?? 'wrote 0 entries')

  const scope = plan.towns.join(', ')
  console.info(
    `[mls-sync] stats rebuild towns=${scope} written=${result.written} skipped=${result.skipped ?? false} reason=${result.skipReason ?? '—'} in ${result.durationMs}ms`,
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
        ? `Stats cache rebuilt on Railway (${plan.trigger}: ${scope}) — ${result.written.toLocaleString()} entries`
        : 'Stats cache rebuilt — 0 entries (check listings inventory / Neon)',
  })
}

/**
 * Never overlap a rebuild with a RETS pull: holding both towns' inventory and
 * the stats payloads in one heap is what OOM-killed this service before.
 */
function startStatsRebuild(
  startedAt: string,
  plan: StatsRebuildPlan,
): {
  accepted: boolean
  alreadyRunning: boolean
  otherJobInFlight: boolean
} {
  if (statsInFlight) {
    return { accepted: false, alreadyRunning: true, otherJobInFlight: false }
  }
  if (anyJobInFlight()) {
    return { accepted: false, alreadyRunning: false, otherJobInFlight: true }
  }

  lastStatsStartedAt = startedAt
  lastStatsFinishedAt = null
  lastStatsOk = null
  lastStatsError = null
  lastStatsWritten = null
  lastStatsPlan = plan
  statsInFlight = executeStatsRebuild(startedAt, plan)
    .catch((err) => {
      lastStatsFinishedAt = new Date().toISOString()
      lastStatsOk = false
      lastStatsError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] stats rebuild failed', err)
    })
    .finally(() => {
      statsInFlight = null
    })
  return { accepted: true, alreadyRunning: false, otherJobInFlight: false }
}

/**
 * Which towns to rebuild and why. Empty `towns` means nothing to do.
 *
 * There is no clock in here any more: the sweep rebuilds towns the incremental
 * pull marked dirty, plus any town whose last rebuild is older than
 * STATS_TOWN_MAX_AGE_MS. The old hourly TTL recomputed all seven towns whether
 * or not a number had moved.
 */
async function statsRebuildPlan(): Promise<StatsRebuildPlan | null> {
  // Configure decides the host. If it says Netlify, this process stays out.
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { resolveJobScheduler } = await import(
    '../../lib/sync-schedule-config-shared'
  )
  const config = await readSyncScheduleConfigFresh()
  if (resolveJobScheduler(config.jobs['stats-cache']) !== 'railway') return null

  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  if (await isScheduledSyncJobPausedFresh('stats-cache')) return null

  const { getSyncMeta } = await import('../../lib/db/sync-meta')

  // A rebuild that dies mid-flight (an OOM kills the whole process) leaves
  // last_stats_cache_started behind with no later last_stats_cache. That stamp
  // is the only guard that survives the restart, so honour it: without it the
  // sweep reruns the same fatal rebuild every time the container boots.
  const [startedAt, finishedAt] = await Promise.all([
    getSyncMeta('last_stats_cache_started'),
    getSyncMeta('last_stats_cache'),
  ])
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN
  const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
  const startWentUnfinished =
    Number.isFinite(startedMs) &&
    (!Number.isFinite(finishedMs) || finishedMs < startedMs)
  if (startWentUnfinished && Date.now() - startedMs < STATS_RETRY_COOLDOWN_MS) {
    return null
  }

  // Configure's Start time is a wall-clock grid, not "an hour after whatever ran
  // last": the jobs are staggered onto separate minutes so they cannot collide
  // and so Start reads as pass/fail at a glance. Dirtiness decides whether there
  // is work; the slot decides when we are allowed to do it.
  const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
  const { statsCacheRunClocks, readStatsCacheLastRun, statsTownsDueForRebuild } =
    await import('../../lib/stats-dirty-towns')
  const lastRun = await readStatsCacheLastRun().catch(() => null)
  const lastStatsEnd = statsCacheRunClocks(lastRun).finishedAt ?? finishedAt
  if (!isJobDueBySchedule(config.jobs['stats-cache'], lastStatsEnd)) return null

  const { towns, reasons } = await statsTownsDueForRebuild()
  if (towns.length === 0) return null
  return { towns, reasons, trigger: 'railway-sweep' }
}

/**
 * Self-scheduled stats sweep.
 *
 * Deliberately not dependent on a Netlify cron reaching us: the thin crons can
 * only ask, and their background-worker hop is being refused site-wide. This
 * process already owns its own pull interval, so it owns the stats sweep too.
 */
function scheduleStatsSweep(): void {
  const tick = async () => {
    if (anyJobInFlight()) return
    const plan = await statsRebuildPlan()
    if (!plan) return
    const why = plan.towns
      .map((town) => `${town}=${plan.reasons[town] ?? 'dirty'}`)
      .join(' ')
    console.info(`[mls-sync] stats rebuild due — ${why}`)
    startStatsRebuild(new Date().toISOString(), plan)
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] stats sweep failed', err)
    })
  }
  setTimeout(run, STATS_SWEEP_DELAY_MS)
  setInterval(run, STATS_SWEEP_MS)
  console.info(
    `[mls-sync] stats sweep every ${Math.round(STATS_SWEEP_MS / 60_000)}m (rebuilds dirty towns; 24h backstop per town)`,
  )
}

/**
 * Goldilocks / listing-scores rebuild, hosted here.
 *
 * Scores every Active listing against its town peer pool. One town at a time —
 * the same discipline the stats rebuild needed, since holding several towns'
 * inventory in one heap is what OOM-killed this container before.
 */
async function executeScoresRebuild(
  startedAt: string,
  trigger: string,
): Promise<void> {
  const { hydrateSyncMetaStore } = await import('../../lib/db/sync-meta-store')
  const { rebuildAllListingScores } = await import(
    '../../lib/listing-scores-rebuild'
  )
  const { recordDashboardSyncAudit } = await import('../../lib/db/listings-repo')

  await hydrateSyncMetaStore()
  const result = await rebuildAllListingScores()
  const finishedAt = new Date().toISOString()
  const failed = result.towns.filter((town) => !town.ok)
  const ok = failed.length === 0 && result.totalScored > 0

  lastScoresFinishedAt = finishedAt
  lastScoresOk = ok
  lastScoresScored = result.totalScored
  lastScoresError = ok
    ? null
    : failed.length > 0
      ? failed.map((town) => `${town.town}: ${town.error ?? 'failed'}`).join('; ')
      : 'scored 0 listings'

  console.info(
    `[mls-sync] goldilocks rebuild scored=${result.totalScored} failed=${failed.length} in ${result.durationMs}ms`,
  )

  await recordDashboardSyncAudit({
    startedAt,
    finishedAt,
    syncSuffix: 'goldilocks',
    listingsCount: result.totalScored,
    ok,
    detail: ok
      ? `Goldilocks rescored on Railway (${trigger}) — ${result.totalScored.toLocaleString()} listings`
      : failed.length > 0
        ? `Goldilocks failed on ${failed.length} town(s): ${lastScoresError}`
        : 'Goldilocks scored 0 listings (check Active inventory)',
  })
}

/** Never overlap Goldilocks with a RETS pull or a stats rebuild (heap). */
function startScoresRebuild(
  startedAt: string,
  trigger: string,
): {
  accepted: boolean
  alreadyRunning: boolean
  otherJobInFlight: boolean
} {
  if (scoresInFlight) {
    return { accepted: false, alreadyRunning: true, otherJobInFlight: false }
  }
  if (anyJobInFlight()) {
    return { accepted: false, alreadyRunning: false, otherJobInFlight: true }
  }

  lastScoresStartedAt = startedAt
  lastScoresFinishedAt = null
  lastScoresOk = null
  lastScoresError = null
  lastScoresScored = null
  lastScoresTrigger = trigger
  scoresInFlight = executeScoresRebuild(startedAt, trigger)
    .catch((err) => {
      lastScoresFinishedAt = new Date().toISOString()
      lastScoresOk = false
      lastScoresError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] goldilocks rebuild failed', err)
    })
    .finally(() => {
      scoresInFlight = null
    })
  return { accepted: true, alreadyRunning: false, otherJobInFlight: false }
}

/** True when Configure points Goldilocks here and its slot has come round. */
async function scoresRebuildIsDue(): Promise<boolean> {
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { resolveJobScheduler } = await import(
    '../../lib/sync-schedule-config-shared'
  )
  const config = await readSyncScheduleConfigFresh()
  if (resolveJobScheduler(config.jobs['listing-scores']) !== 'railway') {
    return false
  }

  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  if (await isScheduledSyncJobPausedFresh('listing-scores')) return false

  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
  const [startedAt, finishedAt] = await Promise.all([
    getSyncMeta('last_listing_scores_started'),
    getSyncMeta('last_listing_scores'),
  ])
  // Same restart guard the stats lane needs: a start with no later finish means
  // the last attempt died mid-flight, so hold off rather than loop on it.
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN
  const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
  if (
    Number.isFinite(startedMs) &&
    (!Number.isFinite(finishedMs) || finishedMs < startedMs) &&
    Date.now() - startedMs < STATS_RETRY_COOLDOWN_MS
  ) {
    return false
  }

  return isJobDueBySchedule(config.jobs['listing-scores'], finishedAt)
}

/**
 * Deal of the Day rebuild, hosted here.
 *
 * Recomputes 42 picks (7 towns × sale/rental × property class) by scoring each
 * town's Active inventory, then fills photo gaps. Minutes of work, so no
 * serverless slot can finish one.
 */
async function executeDotdRebuild(
  startedAt: string,
  trigger: string,
): Promise<void> {
  const { hydrateSyncMetaStore, setSyncMetaDurable } = await import(
    '../../lib/db/sync-meta-store'
  )
  const { rebuildDealOfTheDayCache } = await import(
    '../../lib/deal-of-the-day-cache'
  )
  const { recordDashboardSyncAudit } = await import('../../lib/db/listings-repo')

  await hydrateSyncMetaStore()
  const result = await rebuildDealOfTheDayCache()
  const finishedAt = new Date().toISOString()
  const ok = result.written > 0

  lastDotdFinishedAt = finishedAt
  lastDotdOk = ok
  lastDotdWritten = result.written
  lastDotdError = ok ? null : 'wrote 0 entries'

  // rebuildDealOfTheDayCache() stamps its own finish key, but only on the path
  // that writes entries: an empty-inventory run returns early having stamped
  // Start alone. Stamp it here so a Start never dangles without an End, which is
  // exactly the shape the dashboard reports as a hung job.
  await setSyncMetaDurable('last_deal_of_the_day_cache', finishedAt)

  console.info(
    `[mls-sync] deal-of-the-day rebuild written=${result.written} in ${result.durationMs}ms`,
  )

  await recordDashboardSyncAudit({
    startedAt,
    finishedAt,
    syncSuffix: 'deal-day',
    listingsCount: result.written,
    ok,
    detail: ok
      ? `Deal of the Day rebuilt on Railway (${trigger}) — ${result.written.toLocaleString()} entries`
      : 'Deal of the Day rebuilt — 0 entries (check Active inventory)',
  })
}

function startDotdRebuild(
  startedAt: string,
  trigger: string,
): { accepted: boolean; alreadyRunning: boolean; otherJobInFlight: boolean } {
  if (dotdInFlight) {
    return { accepted: false, alreadyRunning: true, otherJobInFlight: false }
  }
  if (anyJobInFlight()) {
    return { accepted: false, alreadyRunning: false, otherJobInFlight: true }
  }

  lastDotdStartedAt = startedAt
  lastDotdFinishedAt = null
  lastDotdOk = null
  lastDotdError = null
  lastDotdWritten = null
  lastDotdTrigger = trigger
  dotdInFlight = executeDotdRebuild(startedAt, trigger)
    .catch((err) => {
      lastDotdFinishedAt = new Date().toISOString()
      lastDotdOk = false
      lastDotdError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] deal-of-the-day rebuild failed', err)
    })
    .finally(() => {
      dotdInFlight = null
    })
  return { accepted: true, alreadyRunning: false, otherJobInFlight: false }
}

/** True when Configure points Deal of the Day here and its slot has come round. */
async function dotdRebuildIsDue(): Promise<boolean> {
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { resolveJobScheduler } = await import(
    '../../lib/sync-schedule-config-shared'
  )
  const config = await readSyncScheduleConfigFresh()
  if (resolveJobScheduler(config.jobs['deal-of-the-day']) !== 'railway') {
    return false
  }

  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  if (await isScheduledSyncJobPausedFresh('deal-of-the-day')) return false

  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
  const [startedAt, finishedAt] = await Promise.all([
    getSyncMeta('last_deal_of_the_day_cache_started'),
    getSyncMeta('last_deal_of_the_day_cache'),
  ])
  // Same restart guard as stats / Goldilocks: a start with no later finish means
  // the last attempt died mid-flight, so hold off rather than loop on it.
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN
  const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
  if (
    Number.isFinite(startedMs) &&
    (!Number.isFinite(finishedMs) || finishedMs < startedMs) &&
    Date.now() - startedMs < STATS_RETRY_COOLDOWN_MS
  ) {
    return false
  }

  return isJobDueBySchedule(config.jobs['deal-of-the-day'], finishedAt)
}

/**
 * Property address directory sync, hosted here.
 *
 * One upsert per property across every town's MLS rows plus Vision recent sales,
 * sequentially — long enough that a serverless slot cannot see it through.
 */
async function executeAddressesSync(
  startedAt: string,
  trigger: string,
): Promise<void> {
  const { hydrateSyncMetaStore, setSyncMetaDurable } = await import(
    '../../lib/db/sync-meta-store'
  )
  const { syncPropertyAddresses } = await import(
    '../../lib/property-address-sync'
  )
  const { recordDashboardSyncAudit } = await import('../../lib/db/listings-repo')

  await hydrateSyncMetaStore()
  // Recorded before the work, so a container death mid-run leaves evidence the
  // restart guard can see.
  await setSyncMetaDurable(ADDRESSES_ATTEMPT_KEY, startedAt)
  const result = await syncPropertyAddresses()
  const finishedAt = new Date().toISOString()
  const ok = result.ok && result.totalRows > 0

  lastAddressesFinishedAt = finishedAt
  lastAddressesOk = ok
  lastAddressesRows = result.totalRows
  lastAddressesError = ok ? null : 'verified 0 addresses'

  console.info(
    `[mls-sync] property addresses verified=${result.totalRows} (${result.mlsRows} MLS, ${result.assessorRows} assessor) in ${result.durationMs}ms`,
  )

  await recordDashboardSyncAudit({
    startedAt,
    finishedAt,
    syncSuffix: 'addresses',
    listingsCount: result.totalRows,
    ok,
    detail: ok
      ? `Property addresses verified on Railway (${trigger}) — ${result.totalRows.toLocaleString()} rows (${result.mlsRows.toLocaleString()} MLS, ${result.assessorRows.toLocaleString()} assessor)`
      : 'Property addresses verified — 0 rows (check listings inventory / Vision)',
  })
}

function startAddressesSync(
  startedAt: string,
  trigger: string,
): { accepted: boolean; alreadyRunning: boolean; otherJobInFlight: boolean } {
  if (addressesInFlight) {
    return { accepted: false, alreadyRunning: true, otherJobInFlight: false }
  }
  if (anyJobInFlight()) {
    return { accepted: false, alreadyRunning: false, otherJobInFlight: true }
  }

  lastAddressesStartedAt = startedAt
  lastAddressesFinishedAt = null
  lastAddressesOk = null
  lastAddressesError = null
  lastAddressesRows = null
  lastAddressesTrigger = trigger
  addressesInFlight = executeAddressesSync(startedAt, trigger)
    .catch((err) => {
      lastAddressesFinishedAt = new Date().toISOString()
      lastAddressesOk = false
      lastAddressesError = err instanceof Error ? err.message : String(err)
      console.error('[mls-sync] property address sync failed', err)
    })
    .finally(() => {
      addressesInFlight = null
    })
  return { accepted: true, alreadyRunning: false, otherJobInFlight: false }
}

/** True when Configure points the address directory here and its slot is up. */
async function addressesSyncIsDue(): Promise<boolean> {
  const { readSyncScheduleConfigFresh } = await import(
    '../../lib/sync-schedule-config'
  )
  const { resolveJobScheduler } = await import(
    '../../lib/sync-schedule-config-shared'
  )
  const config = await readSyncScheduleConfigFresh()
  if (resolveJobScheduler(config.jobs['property-addresses']) !== 'railway') {
    return false
  }

  const { isScheduledSyncJobPausedFresh } = await import(
    '../../lib/scheduled-sync-toggle'
  )
  if (await isScheduledSyncJobPausedFresh('property-addresses')) return false

  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
  const [attemptAt, finishedAt] = await Promise.all([
    getSyncMeta(ADDRESSES_ATTEMPT_KEY),
    getSyncMeta('property_addresses_synced_at'),
  ])
  const attemptMs = attemptAt ? Date.parse(attemptAt) : Number.NaN
  const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
  if (
    Number.isFinite(attemptMs) &&
    (!Number.isFinite(finishedMs) || finishedMs < attemptMs) &&
    Date.now() - attemptMs < STATS_RETRY_COOLDOWN_MS
  ) {
    return false
  }

  return isJobDueBySchedule(config.jobs['property-addresses'], finishedAt)
}

/**
 * Should a RETS pull start now?
 *
 * Pulls land on Configure's wall-clock grid (Frequency + Start time), not
 * "INTERVAL_MS after boot" — a deploy used to re-phase the whole schedule, which
 * is exactly what made Start times untrustworthy as a pass/fail signal. The
 * scheduler radio and Pause are honoured here too, so Railway stops pulling when
 * Configure hands Incremental to another host.
 *
 * `liveness` is the backstop: if the config read fails or the grid ever wedges,
 * a pull still happens once End is older than twice the interval. Stale listings
 * are the one outcome worse than an off-minute pull.
 */
async function incrementalRunIsDue(): Promise<boolean> {
  const { getSyncMeta } = await import('../../lib/db/sync-meta')
  const finishedAt = await getSyncMeta('last_incremental_sync').catch(() => null)
  const finishedMs = finishedAt ? Date.parse(finishedAt) : Number.NaN
  const liveness =
    !Number.isFinite(finishedMs) || Date.now() - finishedMs >= INTERVAL_MS * 2

  try {
    const { readSyncScheduleConfigFresh } = await import(
      '../../lib/sync-schedule-config'
    )
    const { resolveJobScheduler } = await import(
      '../../lib/sync-schedule-config-shared'
    )
    const config = await readSyncScheduleConfigFresh()
    if (resolveJobScheduler(config.jobs.incremental) !== 'railway') return false

    const { isScheduledSyncJobPausedFresh } = await import(
      '../../lib/scheduled-sync-toggle'
    )
    if (await isScheduledSyncJobPausedFresh('incremental')) return false

    const { isJobDueBySchedule } = await import('../../lib/admin-sync-schedule')
    return isJobDueBySchedule(config.jobs.incremental, finishedAt)
  } catch (err) {
    console.warn(
      `[mls-sync] schedule read failed — falling back to interval liveness (due=${liveness})`,
      err,
    )
    return liveness
  }
}

/** Minute tick that starts a pull at its configured slot. */
function scheduleIncrementalSweep(): void {
  const tick = async () => {
    if (anyJobInFlight()) return
    if (!(await incrementalRunIsDue())) return
    console.info('[mls-sync] incremental due — configured slot reached')
    startRun({ startedAt: new Date().toISOString(), source: 'railway' })
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] incremental sweep failed', err)
    })
  }
  setTimeout(run, 15_000)
  setInterval(run, 60_000)
}

/** Self-scheduled Goldilocks sweep — same reasoning as the stats sweep. */
function scheduleScoresSweep(): void {
  const tick = async () => {
    if (anyJobInFlight()) return
    if (!(await scoresRebuildIsDue())) return
    console.info('[mls-sync] goldilocks due — configured slot reached')
    startScoresRebuild(new Date().toISOString(), 'railway-sweep')
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] goldilocks sweep failed', err)
    })
  }
  setTimeout(run, SCORES_SWEEP_DELAY_MS)
  setInterval(run, SCORES_SWEEP_MS)
  console.info(
    `[mls-sync] goldilocks sweep every ${Math.round(SCORES_SWEEP_MS / 60_000)}m (runs only at the Configure slot)`,
  )
}

/** Self-scheduled Deal of the Day sweep. */
function scheduleDotdSweep(): void {
  const tick = async () => {
    if (anyJobInFlight()) return
    if (!(await dotdRebuildIsDue())) return
    console.info('[mls-sync] deal-of-the-day due — configured slot reached')
    startDotdRebuild(new Date().toISOString(), 'railway-sweep')
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] deal-of-the-day sweep failed', err)
    })
  }
  setTimeout(run, DOTD_SWEEP_DELAY_MS)
  setInterval(run, DOTD_SWEEP_MS)
  console.info(
    `[mls-sync] deal-of-the-day sweep every ${Math.round(DOTD_SWEEP_MS / 60_000)}m (runs only at the Configure slot)`,
  )
}

/** Self-scheduled property address directory sweep. */
function scheduleAddressesSweep(): void {
  const tick = async () => {
    if (anyJobInFlight()) return
    if (!(await addressesSyncIsDue())) return
    console.info('[mls-sync] property addresses due — configured slot reached')
    startAddressesSync(new Date().toISOString(), 'railway-sweep')
  }
  const run = () => {
    void tick().catch((err) => {
      console.warn('[mls-sync] property address sweep failed', err)
    })
  }
  setTimeout(run, ADDRESSES_SWEEP_DELAY_MS)
  setInterval(run, ADDRESSES_SWEEP_MS)
  console.info(
    `[mls-sync] property address sweep every ${Math.round(ADDRESSES_SWEEP_MS / 60_000)}m (runs only at the Configure slot)`,
  )
}

/** Per-town dirty / last-built rows for /health. Never fails the probe. */
async function readStatsTownStatusesSafe(): Promise<unknown> {
  try {
    const { readStatsTownStatuses } = await import('../../lib/stats-dirty-towns')
    return await readStatsTownStatuses()
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
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
        lastStatsPlan,
        last_stats_cache: await getSyncMeta('last_stats_cache'),
        towns: await readStatsTownStatusesSafe(),
      },
      goldilocks: {
        inFlight: scoresInFlight != null,
        lastScoresStartedAt,
        lastScoresFinishedAt,
        lastScoresOk,
        lastScoresScored,
        lastScoresError,
        lastScoresTrigger,
        last_listing_scores: await getSyncMeta('last_listing_scores'),
      },
      dealOfTheDay: {
        inFlight: dotdInFlight != null,
        lastDotdStartedAt,
        lastDotdFinishedAt,
        lastDotdOk,
        lastDotdWritten,
        lastDotdError,
        lastDotdTrigger,
        last_deal_of_the_day_cache: await getSyncMeta(
          'last_deal_of_the_day_cache',
        ),
      },
      propertyAddresses: {
        inFlight: addressesInFlight != null,
        lastAddressesStartedAt,
        lastAddressesFinishedAt,
        lastAddressesOk,
        lastAddressesRows,
        lastAddressesError,
        lastAddressesTrigger,
        property_addresses_synced_at: await getSyncMeta(
          'property_addresses_synced_at',
        ),
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

    // Manual runs (Admin "Sync now") rebuild everything — the operator pressed
    // the button because they do not trust the dirty marks.
    const { TMRE_TOWNS } = await import('../../lib/tmre-towns')
    const requested = Array.isArray(body.towns)
      ? TMRE_TOWNS.filter((town) => (body.towns as unknown[]).includes(town))
      : TMRE_TOWNS
    const plan: StatsRebuildPlan = {
      towns: [...(requested.length > 0 ? requested : TMRE_TOWNS)],
      reasons: {},
      trigger: 'manual',
    }

    const started = startStatsRebuild(startedAt, plan)
    if (started.otherJobInFlight) {
      // 409 reads as "accepted, already busy" to the caller — next tick retries.
      sendJson(res, 409, {
        ok: true,
        accepted: false,
        otherJobInFlight: true,
        message: 'Another job is in flight — stats rebuild deferred to next tick',
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

  if (req.method === 'POST' && path === '/scores') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const startedAt =
      typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
        ? body.startedAt
        : new Date().toISOString()

    const started = startScoresRebuild(startedAt, 'manual')
    if (started.otherJobInFlight) {
      sendJson(res, 409, {
        ok: true,
        accepted: false,
        otherJobInFlight: true,
        message: 'Another job is in flight — Goldilocks deferred to next tick',
      })
      return
    }

    sendJson(res, 202, {
      ok: true,
      accepted: started.accepted,
      alreadyRunning: started.alreadyRunning,
      startedAt,
      message: started.alreadyRunning
        ? 'Goldilocks already running on mls-sync'
        : 'Goldilocks accepted on mls-sync (Railway)',
    })
    return
  }

  if (req.method === 'POST' && path === '/deal-of-the-day') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const startedAt =
      typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
        ? body.startedAt
        : new Date().toISOString()

    const started = startDotdRebuild(startedAt, 'manual')
    if (started.otherJobInFlight) {
      sendJson(res, 409, {
        ok: true,
        accepted: false,
        otherJobInFlight: true,
        message:
          'Another job is in flight — Deal of the Day deferred to next tick',
      })
      return
    }

    sendJson(res, 202, {
      ok: true,
      accepted: started.accepted,
      alreadyRunning: started.alreadyRunning,
      startedAt,
      message: started.alreadyRunning
        ? 'Deal of the Day already running on mls-sync'
        : 'Deal of the Day accepted on mls-sync (Railway)',
    })
    return
  }

  if (req.method === 'POST' && path === '/property-addresses') {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const body = await readJson(req)
    const startedAt =
      typeof body.startedAt === 'string' && !Number.isNaN(Date.parse(body.startedAt))
        ? body.startedAt
        : new Date().toISOString()

    const started = startAddressesSync(startedAt, 'manual')
    if (started.otherJobInFlight) {
      sendJson(res, 409, {
        ok: true,
        accepted: false,
        otherJobInFlight: true,
        message:
          'Another job is in flight — property addresses deferred to next tick',
      })
      return
    }

    sendJson(res, 202, {
      ok: true,
      accepted: started.accepted,
      alreadyRunning: started.alreadyRunning,
      startedAt,
      message: started.alreadyRunning
        ? 'Property addresses already running on mls-sync'
        : 'Property addresses accepted on mls-sync (Railway)',
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
    `[mls-sync] listening on :${PORT} · pulls on the Configure slot (interval backstop ${Math.round(INTERVAL_MS / 60_000)}m) · RETS→Neon (no Netlify pull)`,
  )
  // No boot pull: a deploy must not re-phase the schedule. The sweep starts one
  // within a minute if a slot is already owed.
  scheduleIncrementalSweep()
  // Process-alive signal between pulls. In-run pulse already stamps ~60s;
  // skip while a pull is in flight so we do not double-write.
  setInterval(() => {
    if (runInFlight) return
    void stampHeartbeat(new Date().toISOString()).catch((err) => {
      console.warn('[mls-sync] idle heartbeat failed', err)
    })
  }, 60_000)
  scheduleStatsSweep()
  scheduleScoresSweep()
  scheduleDotdSweep()
  scheduleAddressesSweep()
})
