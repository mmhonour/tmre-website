import 'server-only'

import { recordSyncRun } from '@/lib/db/listings-repo'
import { hydrateSyncMetaStore, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { getSyncStatus, syncIncrementalListings } from '@/lib/listings-sync'
import { healStaleRefreshLock } from '@/lib/listings-refresh-status'
import {
  healStaleOverdueCatchupLock,
  runOverdueSyncCatchup,
} from '@/lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'
import {
  clearSyncNextOverrideAfterRun,
  shouldDeferScheduledJob,
} from '@/lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '@/lib/sync-schedule-config'
import {
  appendIncrementalStep,
  beginIncrementalStepLog,
  continueOrBeginIncrementalStepLog,
  finishIncrementalStepLog,
} from '@/lib/incremental-sync-step-log'

export const LAST_INCREMENTAL_CRON_TICK_KEY = 'last_incremental_cron_tick'

export async function recordIncrementalCronTick(input: {
  startedAt: string
  ok: boolean
  listingsCount?: number
  error?: string | null
  skipped?: boolean
}): Promise<void> {
  const finishedAt = new Date().toISOString()
  try {
    await recordSyncRun({
      startedAt: input.startedAt,
      finishedAt,
      town: '(cron)',
      statusBucket: 'cron/incremental',
      listingsCount: input.listingsCount ?? 0,
      ok: input.ok,
      error: input.error ?? (input.skipped ? 'skipped' : null),
    })
  } catch (err) {
    console.warn('[sync-listings-work] cron tick log failed', err)
  }
}

/**
 * Heartbeat only — stamps sync_meta so Admin can prove the scheduler fired.
 * Does not write a skipped sync_runs row; the thin cron records the real tick
 * after the lean RETS pull.
 */
export async function stampIncrementalCronHeartbeat(startedAt = new Date().toISOString()): Promise<{
  ok: boolean
  startedAt: string
  error?: string
}> {
  try {
    await hydrateSyncMetaStore()
    await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)
    return { ok: true, startedAt }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[sync-listings-work] heartbeat failed', err)
    return { ok: false, startedAt, error }
  }
}

export type IncrementalSyncWorkOptions = {
  /**
   * When true, skip RETS / catch-up incremental — thin cron already pulled.
   * Worker only does spotlight, saved-search alerts, and board/stats warm.
   */
  sideWorkOnly?: boolean
  /**
   * Admin Syncs "Stats cache" — rebuild stats_cache only (no RETS / digests).
   * Steals a stuck rebuild lock so a timed-out Next.js click cannot block forever.
   */
  statsCacheOnly?: boolean
  /**
   * Admin Syncs "Incremental" / watchdog / manual queue — full RETS + digests.
   * Does not stamp the 30-minute cron heartbeat, and ignores schedule pause /
   * Next-override defer (explicit heal / admin intent).
   */
  source?: 'admin' | 'cron' | 'netlify-sync-trigger' | 'watchdog' | 'eventbridge'
  /** Adhoc Admin town scope; omit = all towns. */
  towns?: readonly string[]
  /** Adhoc Admin status filter; omit = all (Active family + Closed). */
  statusScope?: 'all' | 'active' | 'closed'
}

async function runSpotlightAndAlerts(): Promise<{
  savedSearchAlerts: { checked: number; sent: number; listings: number } | null
}> {
  try {
    const { refreshSpotlightStatuses } = await import('@/lib/spotlight-status-sync')
    await refreshSpotlightStatuses()
  } catch (err) {
    console.warn('[sync-listings-work] spotlight status refresh failed', err)
  }

  let savedSearchAlerts: { checked: number; sent: number; listings: number } | null =
    null
  try {
    const { processDueSavedSearchAlerts } = await import('@/lib/saved-search-alerts')
    savedSearchAlerts = await processDueSavedSearchAlerts()
  } catch (err) {
    console.warn('[sync-listings-work] saved-search alerts failed', err)
  }
  return { savedSearchAlerts }
}

/** Board/stats warm + digests — used when thin cron already did lean RETS. */
async function runIncrementalSideWork(): Promise<{
  savedSearchAlerts: { checked: number; sent: number; listings: number } | null
}> {
  try {
    const { warmLatestTownFeedsDeferred } = await import('@/lib/latest-town-feed-cache')
    warmLatestTownFeedsDeferred()
  } catch (err) {
    console.warn('[sync-listings-work] town feed warm schedule failed', err)
  }
  try {
    const { rebuildIntelligenceDealBoardCache } = await import(
      '@/lib/intelligence-deal-board-cache'
    )
    await rebuildIntelligenceDealBoardCache()
  } catch (err) {
    console.warn('[sync-listings-work] intelligence board rebuild failed', err)
  }
  try {
    const { rebuildStatsCache } = await import('@/lib/stats-cache')
    await rebuildStatsCache({ trackRefresh: false })
  } catch (err) {
    console.warn('[sync-listings-work] stats cache rebuild failed', err)
  }
  return runSpotlightAndAlerts()
}

/** Full incremental path — runs in the background worker (up to ~15 min). */
export async function runIncrementalSyncListingsWork(
  startedAt = new Date().toISOString(),
  options: IncrementalSyncWorkOptions = {},
): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  process.env.NETLIFY_SYNC_HANDLER = '1'
  const sideWorkOnly = options.sideWorkOnly === true
  const statsCacheOnly = options.statsCacheOnly === true
  /** Admin click or stale-sync watchdog — bypass pause/defer; don't stamp cron tick. */
  const fromAdmin =
    options.source === 'admin' || options.source === 'watchdog'

  try {
    await hydrateSyncMetaStore()
    if (healStaleRefreshLock()) {
      console.info('[sync-listings-work] cleared stale refresh lock')
    }
    if (healStaleOverdueCatchupLock()) {
      console.info('[sync-listings-work] cleared stale overdue catch-up lock')
    }

    // Admin Syncs "Stats cache" — dedicated path (no RETS / pause gates / cron tick).
    if (statsCacheOnly) {
      const { rebuildStatsCache } = await import('@/lib/stats-cache')
      const { recordDashboardSyncAudit } = await import('@/lib/db/listings-repo')
      const result = await rebuildStatsCache({
        trackRefresh: true,
        force: true,
      })
      const finishedAt = new Date().toISOString()
      const ok = !result.skipped && result.written > 0
      const detail = result.skipped
        ? `Stats cache skipped — ${result.skipReason ?? 'unknown'}`
        : ok
          ? `Stats cache rebuilt — ${result.written.toLocaleString()} entries`
          : 'Stats cache rebuilt — 0 entries (check listings inventory / Neon)'
      console.info(
        `[sync-listings-work] statsCacheOnly written=${result.written} skipped=${result.skipped ?? false} reason=${result.skipReason ?? '—'}`,
      )
      // Sync History — Admin queue only wrote Queued/stats; this is Done|Failed.
      await recordDashboardSyncAudit({
        startedAt,
        finishedAt,
        syncSuffix: 'stats',
        listingsCount: result.written,
        ok,
        detail,
      })
      return {
        status: ok ? 200 : 409,
        body: {
          ok,
          statsCacheOnly: true,
          written: result.written,
          skipped: result.skipped === true,
          skipReason: result.skipReason ?? null,
          durationMs: result.durationMs,
          startedAt,
          finishedAt,
          stats: await getSyncStatus(),
        },
      }
    }

    const logSource = fromAdmin
      ? options.source === 'watchdog'
        ? 'watchdog'
        : 'admin-worker'
      : options.source ?? 'cron-worker'

    const clearLiveOnSkip = async (reason: string) => {
      try {
        const { clearIncrementalSyncLive } = await import(
          '@/lib/incremental-sync-live'
        )
        await clearIncrementalSyncLive()
        console.info(`[sync-listings-work] cleared live Queued — ${reason}`)
      } catch (err) {
        console.warn('[sync-listings-work] clear live on skip failed', err)
      }
    }

    // Pause / defer BEFORE catch-up so a paused schedule cannot spawn more work.
    if (!fromAdmin && (await isScheduledSyncJobPausedFresh('incremental'))) {
      await beginIncrementalStepLog(logSource)
      await appendIncrementalStep('skip', 'incremental scheduled sync paused by admin')
      await finishIncrementalStepLog('skipped — paused by admin')
      await clearLiveOnSkip('paused')
      await recordIncrementalCronTick({
        startedAt,
        ok: false,
        skipped: true,
        error: 'incremental scheduled sync paused by admin',
      })
      return {
        status: 200,
        body: {
          ok: false,
          skipped: true,
          reason: 'incremental scheduled sync paused by admin',
          sideWorkOnly,
        },
      }
    }

    if (!fromAdmin && shouldDeferScheduledJob('incremental')) {
      await beginIncrementalStepLog(logSource)
      await appendIncrementalStep(
        'skip',
        'deferred — Admin Next override is still in the future',
      )
      await finishIncrementalStepLog('skipped — Next override defer')
      await clearLiveOnSkip('Next override defer')
      await recordIncrementalCronTick({
        startedAt,
        ok: false,
        skipped: true,
        error: 'deferred — Admin Next override is still in the future',
      })
      return {
        status: 200,
        body: {
          ok: false,
          skipped: true,
          reason: 'Admin Next override — not due yet',
          sideWorkOnly,
        },
      }
    }

    if (!fromAdmin && shouldSkipScheduledJobNotDue('incremental')) {
      await beginIncrementalStepLog(logSource)
      await appendIncrementalStep(
        'skip',
        'not due yet — Configure frequency / start time',
      )
      await finishIncrementalStepLog('skipped — not due by Configure schedule')
      await clearLiveOnSkip('not due')
      await recordIncrementalCronTick({
        startedAt,
        ok: false,
        skipped: true,
        error: 'not due yet — Configure frequency / start time',
      })
      return {
        status: 200,
        body: {
          ok: false,
          skipped: true,
          reason: 'not due yet — Configure frequency / start time',
          sideWorkOnly,
        },
      }
    }

    // Cron heartbeat is for the */30 schedule only — Admin/watchdog must not stamp it.
    if (!fromAdmin) {
      await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)
    }

    // Only light catch-up here — never chain a weekly full-resync on the 30m path.
    // Never put 'incremental' through catch-up: that calls runAdminSyncAction which
    // on serverless re-queues another worker (nested 202) without doing RETS.
    // This worker runs syncIncrementalListings below instead.
    const catchup = fromAdmin
      ? { skipped: true as const, reason: 'admin-manual', plan: [] as const, steps: [] as const }
      : await runOverdueSyncCatchup({
          reason: 'netlify/sync-listings-worker',
          onlyJobs: ['stats-cache', 'publish-snapshot'],
        })

    if (sideWorkOnly) {
      await continueOrBeginIncrementalStepLog(logSource)
      await appendIncrementalStep('side-work-only', 'RETS already completed by thin cron')
      const { savedSearchAlerts } = await runIncrementalSideWork()
      await finishIncrementalStepLog('side-work only (no RETS)')
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        listingsCount: 0,
        skipped: true,
        error: 'side-work only (RETS already completed by thin cron)',
      })
      return {
        status: 200,
        body: {
          ok: true,
          sideWorkOnly: true,
          savedSearchAlerts,
          stats: await getSyncStatus(),
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        },
      }
    }

    // Continue queue breadcrumb when present; otherwise open a fresh run log.
    await continueOrBeginIncrementalStepLog(logSource)
    await appendIncrementalStep(
      'worker-start',
      `catchup=${catchup.skipped ? catchup.reason : 'ran'}`,
    )

    const { isTmreTown } = await import('@/lib/tmre-towns')
    type TmreTown = import('@/lib/tmre-towns').TmreTown
    // Recover Admin scope from the queue breadcrumb if the POST body lost towns
    // (Netlify background hops have dropped fields before).
    const { readIncrementalSyncLive } = await import(
      '@/lib/incremental-sync-live'
    )
    const queuedLive = readIncrementalSyncLive()
    const bodyTowns = (options.towns ?? [])
      .map((t) => t.trim())
      .filter((t): t is TmreTown => isTmreTown(t))
    const liveTowns = (queuedLive?.scopeTowns ?? [])
      .map((t) => t.trim())
      .filter((t): t is TmreTown => isTmreTown(t))
    const scopedTowns = bodyTowns.length > 0 ? bodyTowns : liveTowns
    const statusScope =
      options.statusScope === 'active' || options.statusScope === 'closed'
        ? options.statusScope
        : queuedLive?.statusScope === 'active' ||
            queuedLive?.statusScope === 'closed'
          ? queuedLive.statusScope
          : undefined
    if (
      bodyTowns.length === 0 &&
      liveTowns.length > 0 &&
      queuedLive?.phase === 'queued'
    ) {
      console.info(
        '[sync-listings-work] recovered town scope from live breadcrumb',
        liveTowns.join(', '),
      )
    }
    const result = await syncIncrementalListings({
      postHooks: true,
      ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
      ...(statusScope ? { statusScope } : {}),
    })
    const skippedEmpty = result.towns.length === 0 && result.durationMs === 0
    const okTowns = skippedEmpty ? true : result.towns.every((row) => row.ok)
    const townErrors = skippedEmpty
      ? 'no town work (RETS missing, refresh lock, or empty tick)'
      : result.towns
          .filter((row) => !row.ok)
          .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
          .join('; ') || null
    if (!fromAdmin) {
      await recordIncrementalCronTick({
        startedAt: result.startedAt || startedAt,
        ok: okTowns,
        listingsCount: result.totalUpserted,
        skipped: skippedEmpty,
        error: townErrors,
      })
    }

    // Queued/Worker audits always write listings_count=0. This Done roll-up is
    // the job-level finish line with total upserted across towns.
    try {
      const totalInserted = result.towns.reduce(
        (sum, row) => sum + (row.inserted ?? 0),
        0,
      )
      const totalUpdated = result.towns.reduce(
        (sum, row) => sum + (row.updated ?? 0),
        0,
      )
      const upsertDetail = `${totalInserted} new, ${totalUpdated} updated`
      await recordSyncRun({
        startedAt: result.startedAt || startedAt,
        finishedAt: new Date().toISOString(),
        town: '(all)',
        statusBucket: 'Done/incremental',
        listingsCount: result.totalUpserted,
        ok: okTowns,
        error: townErrors
          ? `${townErrors} · ${upsertDetail}`
          : upsertDetail,
      })
    } catch (err) {
      console.warn('[sync-listings-work] Done/incremental audit failed', err)
    }

    // RETS path already ran postHooks (board/stats); only digests remain.
    const { savedSearchAlerts } = await runSpotlightAndAlerts()

    const ok = result.towns.length === 0 || result.towns.every((row) => row.ok)
    if (ok && !skippedEmpty) {
      await clearSyncNextOverrideAfterRun('incremental')
    }
    return {
      status: ok ? 200 : 502,
      body: {
        ok,
        ...result,
        sideWorkOnly: false,
        source: fromAdmin ? 'admin' : options.source ?? 'cron',
        savedSearchAlerts,
        stats: await getSyncStatus(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
      },
    }
  } catch (err) {
    console.error('[sync-listings-work]', err)
    const message = err instanceof Error ? err.message : String(err)
    try {
      await continueOrBeginIncrementalStepLog(
        options.source === 'watchdog'
          ? 'watchdog'
          : options.source === 'admin'
            ? 'admin-worker'
            : options.source ?? 'cron-worker',
      )
      await appendIncrementalStep('fatal', message)
      await finishIncrementalStepLog(`fatal: ${message}`)
    } catch {
      /* ignore */
    }
    if (!fromAdmin) {
      await recordIncrementalCronTick({
        startedAt,
        ok: false,
        error: message,
      })
    }
    try {
      await recordSyncRun({
        startedAt,
        finishedAt: new Date().toISOString(),
        town: '(all)',
        statusBucket: 'Done/incremental',
        listingsCount: 0,
        ok: false,
        error: message,
      })
    } catch {
      /* ignore */
    }
    return {
      status: 500,
      body: { error: message },
    }
  }
}
