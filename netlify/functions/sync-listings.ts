import type { Config } from '@netlify/functions'
import {
  hydrateSyncMetaStore,
} from '../../lib/db/sync-meta-store'
import {
  recordIncrementalCronTick,
  stampIncrementalCronHeartbeat,
} from '../../lib/netlify-sync-listings-work'
import { queueNetlifyIncrementalSync } from '../../lib/netlify-sync-trigger'
import { healStaleRefreshLock } from '../../lib/listings-refresh-status'
import { healStaleOverdueCatchupLock } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { syncIncrementalListings } from '../../lib/listings-sync'
import {
  clearSyncNextOverrideAfterRun,
  shouldDeferScheduledJob,
} from '../../lib/sync-next-override'

/**
 * Scheduled incremental trigger (NO background flag) — must finish in ~30s.
 *
 * Pattern (data-first — never depend on the HTTP hop for MLS freshness):
 *   1) Stamp heartbeat (proves the cron fired)
 *   2) ALWAYS lean in-process RETS pull (no board/stats — stays under 30s)
 *   3) Optionally queue sync-listings-worker for side work (spotlight / alerts /
 *      board warm). Hop failure must not drop inventory.
 *
 * Do NOT put schedule+background on one function (silent no-op on Netlify).
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

    const heartbeat = await stampIncrementalCronHeartbeat(startedAt)
    if (!heartbeat.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          mode: 'scheduled-in-process',
          error: heartbeat.error ?? 'heartbeat failed',
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      )
    }

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

    // ★ Data path — always. Hop must never be required for MLS upserts.
    const result = await syncIncrementalListings({ postHooks: false })
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

    // Optional side work — fire-and-forget. Failure does not fail this tick.
    let workerQueued: {
      ok: boolean
      status: number | null
      base: string | null
      error?: string | null
    } | null = null
    try {
      const queued = await queueNetlifyIncrementalSync(startedAt, {
        sideWorkOnly: true,
      })
      workerQueued = {
        ok: queued.ok,
        status: queued.status,
        base: queued.base,
        error: queued.error ?? null,
      }
      if (queued.ok) {
        console.info(
          `[netlify/sync-listings] lean RETS done; side-work worker via ${queued.base} (HTTP ${queued.status})`,
        )
      } else {
        console.warn(
          `[netlify/sync-listings] lean RETS done; side-work queue failed (${queued.error}) — inventory still updated`,
        )
      }
    } catch (err) {
      console.warn('[netlify/sync-listings] side-work queue threw', err)
      workerQueued = {
        ok: false,
        status: null,
        base: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    return new Response(
      JSON.stringify({
        ...result,
        ok: okTowns,
        mode: 'scheduled-in-process',
        startedAt,
        workerQueued,
      }),
      {
        status: okTowns ? 200 : 502,
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
