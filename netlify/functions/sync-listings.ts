import type { Config } from '@netlify/functions'
import {
  hydrateSyncMetaStore,
  setSyncMetaDurable,
} from '../../lib/db/sync-meta-store'
import {
  LAST_INCREMENTAL_CRON_TICK_KEY,
  recordIncrementalCronTick,
  runIncrementalSyncListingsWork,
} from '../../lib/netlify-sync-listings-work'
import { healStaleRefreshLock } from '../../lib/sqlite-refresh-status'
import { healStaleOverdueCatchupLock } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { syncIncrementalListings, getSyncStatus } from '../../lib/listings-sync'
import {
  clearSyncNextOverrideAfterRun,
  shouldDeferScheduledJob,
} from '../../lib/sync-next-override'

/**
 * Scheduled incremental trigger (NO background flag).
 *
 * Runs the RETS pull in-process. A schedule→HTTP→background hop is fragile
 * (missing URL at runtime, site password, 404) and was the likely failure at
 * 8:30 after deploy — build was live, but the worker never got queued.
 *
 * Keep this under Netlify's ~30s scheduled-function limit: incremental only,
 * no full-resync catch-up, no saved-search digests (those stay on the worker /
 * Admin "Run cron now").
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'
  const startedAt = new Date().toISOString()

  try {
    await hydrateSyncMetaStore()
    if (healStaleRefreshLock()) {
      console.info('[netlify/sync-listings] cleared stale refresh lock')
    }
    if (healStaleOverdueCatchupLock()) {
      console.info('[netlify/sync-listings] cleared stale overdue catch-up lock')
    }
    await setSyncMetaDurable(LAST_INCREMENTAL_CRON_TICK_KEY, startedAt)

    if (await isScheduledSyncJobPausedFresh('incremental')) {
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        skipped: true,
        error: 'incremental scheduled sync paused by admin',
      })
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'scheduled-in-process',
          skipped: true,
          reason: 'incremental scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    if (shouldDeferScheduledJob('incremental')) {
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        skipped: true,
        error: 'deferred — Admin Next override is still in the future',
      })
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'scheduled-in-process',
          skipped: true,
          reason: 'Admin Next override — not due yet',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    // Lean path — sync only (typical ~10–20s). Spotlight/alerts via worker/Admin.
    const result = await syncIncrementalListings()
    const skippedEmpty = result.towns.length === 0 && result.durationMs === 0
    const okTowns = skippedEmpty ? true : result.towns.every((row) => row.ok)
    await recordIncrementalCronTick({
      startedAt: result.startedAt || startedAt,
      ok: okTowns,
      listingsCount: result.totalUpserted,
      skipped: skippedEmpty,
      error: skippedEmpty
        ? 'no town work (RETS missing, refresh lock, or empty tick)'
        : result.towns
            .filter((row) => !row.ok)
            .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
            .join('; ') || null,
    })
    if (okTowns && !skippedEmpty) {
      await clearSyncNextOverrideAfterRun('incremental')
    }

    // Best-effort spotlight status (bounded); do not block the schedule on digests.
    try {
      const { refreshSpotlightStatuses } = await import(
        '../../lib/spotlight-status-sync'
      )
      await refreshSpotlightStatuses()
    } catch (err) {
      console.warn('[netlify/sync-listings] spotlight status refresh failed', err)
    }

    const ok = result.towns.length === 0 || result.towns.every((row) => row.ok)
    return new Response(
      JSON.stringify({
        ...result,
        ok,
        mode: 'scheduled-in-process',
        stats: await getSyncStatus(),
      }),
      {
        status: ok ? 200 : 502,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-listings]', err)
    try {
      await recordIncrementalCronTick({
        startedAt,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } catch {
      /* ignore */
    }
    // Last resort: full worker path (same process) if lean path threw early.
    try {
      const fallback = await runIncrementalSyncListingsWork(startedAt)
      return new Response(JSON.stringify({ mode: 'fallback-work', ...fallback.body }), {
        status: fallback.status,
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      /* ignore */
    }
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        mode: 'scheduled-in-process',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // Literal cron. Do NOT set background: true on this function.
  schedule: '*/30 * * * *',
}
