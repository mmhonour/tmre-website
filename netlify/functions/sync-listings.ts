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
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import { thinCronSkipIfAnotherHostOwns } from '../../lib/netlify-thin-cron'

/**
 * Scheduled incremental trigger (NO background flag) — must finish in ~26–30s.
 *
 * Pattern (queue-first for reliability under Netlify schedule limits):
 *   1) Stamp heartbeat (proves the cron fired)
 *   2) Queue sync-listings-worker for full RETS + digests (up to ~15 min)
 *   3) Only if the queue hop fails: lean in-process RETS, then queue
 *      side-work-only worker for board/stats (lean itself skips postHooks)
 *
 * Doing 7-town RETS inside this scheduled function routinely times out; that
 * looked like “4pm failed” even when the scheduler did fire. Side-work-only
 * workers also made Admin “Sync now” look instant while cron still raced the
 * refresh lock.
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
      // Still audit — otherwise Admin shows "never" with no failure row.
      try {
        await recordIncrementalCronTick({
          startedAt,
          ok: false,
          error: heartbeat.error ?? 'heartbeat failed (DATABASE_URL?)',
        })
      } catch {
        /* ignore */
      }
      return new Response(
        JSON.stringify({
          ok: false,
          mode: 'scheduled-queue',
          error: heartbeat.error ?? 'heartbeat failed',
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      )
    }

    {
      const owned = await thinCronSkipIfAnotherHostOwns('incremental')
      if (owned) {
        // ok:true — intentional Configure skip, not a failed pull (History ≠ Failed).
        // Reason comes from the guard so History names the real owner (Railway
        // or EventBridge) instead of a hardcoded guess.
        let reason = 'another scheduler owns this job — Netlify cron ignored'
        try {
          const body = (await owned.clone().json()) as { reason?: unknown }
          if (typeof body.reason === 'string' && body.reason) reason = body.reason
        } catch {
          /* keep fallback */
        }
        await recordIncrementalCronTick({
          startedAt,
          ok: true,
          skipped: true,
          error: reason,
        })
        return owned
      }
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
      // Heal stuck overrides: if inventory is already stale, watchdog may queue.
      try {
        const { runIncrementalSyncWatchdog } = await import(
          '../../lib/incremental-sync-watchdog'
        )
        await runIncrementalSyncWatchdog()
      } catch (err) {
        console.warn('[netlify/sync-listings] watchdog after defer failed', err)
      }
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

    if (shouldSkipScheduledJobNotDue('incremental')) {
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        skipped: true,
        error: 'not due yet — Configure frequency / start time',
      })
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'scheduled-queue',
          skipped: true,
          reason: 'not due yet — Configure frequency / start time',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    // ★ Primary path — background worker has ~15 minutes for full RETS.
    // If a prior hop is still Queued (worker never started) past the dead-queue
    // window, skip another 202 stamp and lean-fallback so End advances.
    let skipQueueForLeanFallback = false
    try {
      const {
        clearIncrementalSyncLive,
        isIncrementalSyncQueuedDead,
        readIncrementalSyncLive,
      } = await import('../../lib/incremental-sync-live')
      const live = readIncrementalSyncLive()
      if (isIncrementalSyncQueuedDead(live)) {
        console.warn(
          '[netlify/sync-listings] dead Queued hop — clearing live and leaning in-process RETS',
        )
        await clearIncrementalSyncLive()
        skipQueueForLeanFallback = true
      } else if (live?.phase === 'queued') {
        // Still inside the dead-queue window — don't re-stamp Start/Queued
        // (that was the forever-Queued deadlock with */30 cron).
        await recordIncrementalCronTick({
          startedAt,
          ok: true,
          skipped: true,
          error: 'prior queue still waiting for worker — not re-stamping',
        })
        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'scheduled-queue-waiting',
            startedAt,
            workerQueued: {
              ok: true,
              status: null,
              base: null,
              error: 'prior queue still in flight',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
    } catch (err) {
      console.warn('[netlify/sync-listings] live queue check failed', err)
    }

    if (!skipQueueForLeanFallback) {
      try {
        const queued = await queueNetlifyIncrementalSync(startedAt, {
          source: 'cron',
        })
        if (queued.ok) {
          console.info(
            `[netlify/sync-listings] queued full worker via ${queued.base} (HTTP ${queued.status})`,
          )
          // Heartbeat already stamped; worker will write last_incremental_sync when RETS finishes.
          try {
            const { recordIncrementalQueueAudit } = await import(
              '../../lib/db/listings-repo'
            )
            await recordIncrementalQueueAudit({
              startedAt,
              source: 'cron',
              queued: true,
              detail: `${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`,
            })
          } catch (err) {
            console.warn('[netlify/sync-listings] queue audit failed', err)
          }
          try {
            const { stampIncrementalSyncLive } = await import(
              '../../lib/incremental-sync-live'
            )
            const { setSyncMetaDurable } = await import(
              '../../lib/db/sync-meta-store'
            )
            await setSyncMetaDurable('last_incremental_sync_started', startedAt)
            await stampIncrementalSyncLive({
              phase: 'queued',
              town: null,
              townIndex: null,
              updatedAt: startedAt,
              // Explicit clear — do not inherit a prior Admin Ridgefield queue.
              scopeTowns: undefined,
              statusScope: 'all',
            })
          } catch (err) {
            console.warn('[netlify/sync-listings] live progress stamp failed', err)
          }
          try {
            const { stampIncrementalQueuedStepLog } = await import(
              '../../lib/incremental-sync-step-log'
            )
            await stampIncrementalQueuedStepLog(
              'cron-queue',
              `${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`,
            )
          } catch (err) {
            console.warn('[netlify/sync-listings] step log queue stamp failed', err)
          }
          await recordIncrementalCronTick({
            startedAt,
            ok: true,
            skipped: false,
            listingsCount: 0,
            error: null,
          })
          // Closed loop: if a prior worker died, watchdog will re-queue once stale.
          try {
            const { runIncrementalSyncWatchdog } = await import(
              '../../lib/incremental-sync-watchdog'
            )
            await runIncrementalSyncWatchdog()
          } catch (err) {
            console.warn('[netlify/sync-listings] post-queue watchdog failed', err)
          }
          return new Response(
            JSON.stringify({
              ok: true,
              mode: 'scheduled-queue',
              startedAt,
              workerQueued: {
                ok: true,
                status: queued.status,
                base: queued.base,
                error: null,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        console.warn(
          `[netlify/sync-listings] worker queue failed (${queued.error}) — falling back to lean in-process RETS`,
        )
      } catch (err) {
        console.warn(
          '[netlify/sync-listings] worker queue threw — falling back to lean in-process RETS',
          err,
        )
      }
    }

    // Fallback — keep inventory moving if the HTTP hop to the worker is broken.
    // postHooks=false stays inside the ~30s schedule budget; board/stats warm is
    // queued as side-work-only so UC pills and scores don't go stale for days.
    const result = await syncIncrementalListings({
      postHooks: false,
      stepLogSource: 'cron-lean-fallback',
    })
    const skippedEmpty = result.towns.length === 0 && result.durationMs === 0
    const okTowns = skippedEmpty ? true : result.towns.every((row) => row.ok)
    await recordIncrementalCronTick({
      startedAt: result.startedAt || startedAt,
      ok: okTowns,
      listingsCount: result.totalUpserted,
      skipped: skippedEmpty,
      error: skippedEmpty
        ? 'lean fallback: no town work (RETS missing, refresh lock, or empty tick)'
        : result.towns
            .filter((row) => !row.ok)
            .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
            .join('; ') || 'lean fallback after queue failure',
    })
    let sideWorkQueued: { ok: boolean; error: string | null } = {
      ok: false,
      error: null,
    }
    if (okTowns && !skippedEmpty) {
      await clearSyncNextOverrideAfterRun('incremental')
      try {
        const side = await queueNetlifyIncrementalSync(
          new Date().toISOString(),
          { sideWorkOnly: true, source: 'cron' },
        )
        sideWorkQueued = {
          ok: side.ok,
          error: side.ok ? null : side.error ?? 'side-work queue failed',
        }
        if (!side.ok) {
          console.warn(
            `[netlify/sync-listings] side-work queue after lean failed (${side.error})`,
          )
        }
      } catch (err) {
        sideWorkQueued = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
        console.warn(
          '[netlify/sync-listings] side-work queue after lean threw',
          err,
        )
      }
    }

    return new Response(
      JSON.stringify({
        ...result,
        ok: okTowns,
        mode: 'scheduled-lean-fallback',
        startedAt,
        workerQueued: { ok: false, status: null, base: null, error: 'queue failed' },
        sideWorkQueued,
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
