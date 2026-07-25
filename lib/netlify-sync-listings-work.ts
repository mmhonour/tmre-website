import 'server-only'

import { recordSyncRun } from '@/lib/db/listings-repo'
import { hydrateSyncMetaStore, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { getSyncStatus, syncIncrementalListings } from '@/lib/listings-sync'
import { healStaleRefreshLock } from '@/lib/sqlite-refresh-status'
import {
  healStaleOverdueCatchupLock,
  runOverdueSyncCatchup,
} from '@/lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'

export const LAST_INCREMENTAL_CRON_TICK_KEY = 'last_incremental_cron_tick'

async function recordIncrementalCronTick(input: {
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
 * Heartbeat only — safe for the thin scheduled function (<30s).
 * Proves Netlify's scheduler fired even when the background worker never runs.
 */
export async function stampIncrementalCronHeartbeat(startedAt = new Date().toISOString()): Promise<{
  ok: boolean
  startedAt: string
  error?: string
}> {
  try {
    await hydrateSyncMetaStore()
    await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)
    await recordIncrementalCronTick({
      startedAt,
      ok: true,
      skipped: true,
      error: 'scheduler heartbeat (worker queued separately)',
    })
    return { ok: true, startedAt }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[sync-listings-work] heartbeat failed', err)
    return { ok: false, startedAt, error }
  }
}

/** Full incremental path — runs in the background worker (up to ~15 min). */
export async function runIncrementalSyncListingsWork(startedAt = new Date().toISOString()): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  try {
    await hydrateSyncMetaStore()
    if (healStaleRefreshLock()) {
      console.info('[sync-listings-work] cleared stale refresh lock')
    }
    if (healStaleOverdueCatchupLock()) {
      console.info('[sync-listings-work] cleared stale overdue catch-up lock')
    }
    await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)

    // Only light catch-up here — never chain a weekly full-resync on the 30m path.
    // Full reload stays on sync-listings-full.
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-listings-worker',
      onlyJobs: ['incremental', 'stats-cache', 'publish-snapshot'],
    })

    if (await isScheduledSyncJobPausedFresh('incremental')) {
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        skipped: true,
        error: 'incremental scheduled sync paused by admin',
      })
      return {
        status: 200,
        body: {
          ok: true,
          skipped: true,
          reason: 'incremental scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        },
      }
    }

    const result = await syncIncrementalListings()
    const skippedEmpty = result.towns.length === 0 && result.durationMs === 0
    await recordIncrementalCronTick({
      startedAt: result.startedAt || startedAt,
      ok: skippedEmpty ? true : result.towns.every((row) => row.ok),
      listingsCount: result.totalUpserted,
      skipped: skippedEmpty,
      error: skippedEmpty
        ? 'no town work (RETS missing, refresh lock, or empty tick)'
        : result.towns
            .filter((row) => !row.ok)
            .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
            .join('; ') || null,
    })

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

    const ok = result.towns.length === 0 || result.towns.every((row) => row.ok)
    return {
      status: ok ? 200 : 502,
      body: {
        ok,
        ...result,
        savedSearchAlerts,
        stats: await getSyncStatus(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
      },
    }
  } catch (err) {
    console.error('[sync-listings-work]', err)
    await recordIncrementalCronTick({
      startedAt,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}
