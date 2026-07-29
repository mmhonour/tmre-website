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
   * Admin Syncs "Incremental" / watchdog / manual queue — full RETS + digests.
   * Does not stamp the 30-minute cron heartbeat, and ignores schedule pause /
   * Next-override defer (explicit heal / admin intent).
   */
  source?: 'admin' | 'cron' | 'netlify-sync-trigger' | 'watchdog'
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

    const {
      appendIncrementalStep,
      beginIncrementalStepLog,
      continueOrBeginIncrementalStepLog,
      finishIncrementalStepLog,
    } = await import('@/lib/incremental-sync-step-log')
    const logSource = fromAdmin
      ? options.source === 'watchdog'
        ? 'watchdog'
        : 'admin-worker'
      : options.source ?? 'cron-worker'

    // Pause / defer BEFORE catch-up so a paused schedule cannot spawn more work.
    if (!fromAdmin && (await isScheduledSyncJobPausedFresh('incremental'))) {
      await beginIncrementalStepLog(logSource)
      await appendIncrementalStep('skip', 'incremental scheduled sync paused by admin')
      await finishIncrementalStepLog('skipped — paused by admin')
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

    // Cron heartbeat is for the */30 schedule only — Admin/watchdog must not stamp it.
    if (!fromAdmin) {
      await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)
    }

    // Only light catch-up here — never chain a weekly full-resync on the 30m path.
    // Full reload stays on sync-listings-full. When thin cron already pulled RETS,
    // skip 'incremental' so we don't double-hit MLS. Admin/watchdog skip catch-up —
    // the explicit job below is the whole point of the click/heal.
    const catchup = fromAdmin
      ? { skipped: true as const, reason: 'admin-manual', plan: [] as const, steps: [] as const }
      : await runOverdueSyncCatchup({
          reason: 'netlify/sync-listings-worker',
          onlyJobs: sideWorkOnly
            ? ['stats-cache', 'publish-snapshot']
            : ['incremental', 'stats-cache', 'publish-snapshot'],
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

    const result = await syncIncrementalListings({ postHooks: true })
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
      await recordSyncRun({
        startedAt: result.startedAt || startedAt,
        finishedAt: new Date().toISOString(),
        town: '(all)',
        statusBucket: 'Done/incremental',
        listingsCount: result.totalUpserted,
        ok: okTowns,
        error: townErrors,
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
      const {
        appendIncrementalStep,
        continueOrBeginIncrementalStepLog,
        finishIncrementalStepLog,
      } = await import('@/lib/incremental-sync-step-log')
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
