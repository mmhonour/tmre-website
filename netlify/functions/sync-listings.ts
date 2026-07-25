import type { Config } from '@netlify/functions'
import {
  hydrateSyncMetaStore,
} from '../../lib/db/sync-meta-store'
import {
  recordIncrementalCronTick,
  stampIncrementalCronHeartbeat,
} from '../../lib/netlify-sync-listings-work'
import { queueNetlifyIncrementalSync } from '../../lib/netlify-sync-trigger'
import { healStaleRefreshLock } from '../../lib/sqlite-refresh-status'
import { healStaleOverdueCatchupLock } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { syncIncrementalListings } from '../../lib/listings-sync'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'

/**
 * Scheduled incremental trigger (NO background flag) — must finish in ~30s.
 *
 * Pattern:
 *   1) Stamp heartbeat (proves the cron fired)
 *   2) Queue sync-listings-worker (background, ~15m) for the real RETS pull
 *   3) If queue fails → lean in-process RETS-only fallback (no board/stats)
 *
 * Do NOT put schedule+background on one function (silent no-op on Netlify).
 * Do NOT rely on in-process full sync+board rebuild here — it exceeds 30s.
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
          mode: 'scheduled-queue',
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
          mode: 'scheduled-queue',
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
          mode: 'scheduled-queue',
          skipped: true,
          reason: 'Admin Next override — not due yet',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const queued = await queueNetlifyIncrementalSync(startedAt)
    if (queued.ok) {
      console.info(
        `[netlify/sync-listings] queued worker via ${queued.base} (HTTP ${queued.status})`,
      )
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'queued-worker',
          startedAt,
          workerStatus: queued.status,
          workerBase: queued.base,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    // Hop failed (missing URL, password gate, 404) — same class as 8:30/9:00 misses.
    console.warn(
      `[netlify/sync-listings] worker queue failed (${queued.error}) — lean in-process fallback`,
    )
    const result = await syncIncrementalListings({ postHooks: false })
    const skippedEmpty = result.towns.length === 0 && result.durationMs === 0
    const okTowns = skippedEmpty ? true : result.towns.every((row) => row.ok)
    const queueNote = `worker queue failed: ${queued.error ?? 'unknown'}`
    await recordIncrementalCronTick({
      startedAt: result.startedAt || startedAt,
      ok: okTowns,
      listingsCount: result.totalUpserted,
      skipped: skippedEmpty,
      error: skippedEmpty
        ? `${queueNote}; lean fallback: no town work`
        : result.towns
            .filter((row) => !row.ok)
            .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
            .join('; ') || `${queueNote}; lean fallback completed`,
    })

    return new Response(
      JSON.stringify({
        ...result,
        ok: okTowns,
        mode: 'lean-fallback',
        startedAt,
        queueError: queued.error ?? null,
        workerStatus: queued.status,
        workerBase: queued.base,
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
        mode: 'scheduled-queue',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // Literal cron. Do NOT set background: true on this function.
  schedule: '*/30 * * * *',
}
