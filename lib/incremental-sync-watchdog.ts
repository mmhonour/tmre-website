import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { hydrateSyncMetaStore, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { recordSyncRun } from '@/lib/db/listings-repo'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'
import { queueNetlifyIncrementalSync } from '@/lib/netlify-sync-trigger'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  clearIncrementalSyncLive,
  isIncrementalSyncLiveStale,
  isIncrementalSyncQueuedDead,
  readIncrementalSyncLive,
  stampIncrementalSyncLive,
} from '@/lib/incremental-sync-live'

/** If last successful incremental is older than this, force a worker queue. */
export const INCREMENTAL_SYNC_STALE_MS = 70 * 60 * 1000
/** Don't re-queue watchdog more often than this (avoids stampede). */
export const INCREMENTAL_WATCHDOG_COOLDOWN_MS = 12 * 60 * 1000

const LAST_WATCHDOG_AT_KEY = 'last_incremental_watchdog_at'

export type IncrementalWatchdogResult = {
  action:
    | 'fresh'
    | 'paused'
    | 'skipped_provider'
    | 'queued'
    | 'queue_failed'
    | 'cooldown'
    | 'in_progress'
    | 'ran_local'
  lastIncrementalSync: string | null
  ageMs: number | null
  detail?: string
}

function parseAgeMs(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return Math.max(0, nowMs - ms)
}

/**
 * Closed-loop heal for incremental MLS.
 *
 * Netlify cron has several silent skip gates (pause, Next override, hung hop,
 * dead worker). When `last_incremental_sync` is older than ~70 minutes and the
 * job is not paused, queue the background worker with source=watchdog (bypasses
 * Next-override defer) so inventory keeps moving without Admin button clicks.
 *
 * Also heals when Scheduler is EventBridge — EB owns the alarm clock, but a
 * queued-with-no-End / wiped-End failure still needs this Netlify 15m backstop.
 *
 * Dead "Queued…" hops (worker never reached town pulls) are cleared so a fresh
 * queue can land — cron 202 acks must not forever look "in progress".
 */
export async function runIncrementalSyncWatchdog(
  options: { force?: boolean } = {},
): Promise<IncrementalWatchdogResult> {
  const nowMs = Date.now()
  await hydrateSyncMetaStore()

  const lastIncrementalSync = await getSyncMetaFresh('last_incremental_sync')
  const ageMs = parseAgeMs(lastIncrementalSync, nowMs)
  const stale =
    options.force === true ||
    ageMs == null ||
    ageMs > INCREMENTAL_SYNC_STALE_MS

  if (!stale) {
    return {
      action: 'fresh',
      lastIncrementalSync,
      ageMs,
      detail: 'last_incremental_sync within window',
    }
  }

  if (await isScheduledSyncJobPausedFresh('incremental')) {
    return {
      action: 'paused',
      lastIncrementalSync,
      ageMs,
      detail: 'incremental paused in Admin → Syncs → Configure',
    }
  }

  {
    const { readSyncScheduleConfigFresh, resolveJobScheduler } = await import(
      '@/lib/sync-schedule-config'
    )
    const config = await readSyncScheduleConfigFresh()
    if (resolveJobScheduler(config.jobs.incremental) === 'railway') {
      // Railway mls-sync owns the schedule + heal. Do not queue Netlify workers.
      return {
        action: 'skipped_provider',
        lastIncrementalSync,
        ageMs,
        detail:
          'scheduler is Railway mls-sync — Netlify watchdog ignored (service pulls RETS→Neon)',
      }
    }
  }

  // End is already stale (>70m or never) when we get here. A Queued breadcrumb
  // with a stale End means the worker never finished RETS — clear and re-queue.
  // (Do not treat queue-only Start stamps as "in progress"; that was the
  // forever-Queued deadlock when */30 cron kept refreshing Start.)
  const live = readIncrementalSyncLive()
  if (live?.phase === 'queued' || isIncrementalSyncQueuedDead(live, nowMs)) {
    await clearIncrementalSyncLive()
  } else if (
    (live?.phase === 'town' || live?.phase === 'post-hooks') &&
    !isIncrementalSyncLiveStale(live, nowMs)
  ) {
    return {
      action: 'in_progress',
      lastIncrementalSync,
      ageMs,
      detail: `worker live (${live.phase}${live.town ? ` ${live.town}` : ''})`,
    }
  } else if (live && isIncrementalSyncLiveStale(live, nowMs)) {
    await clearIncrementalSyncLive()
  }

  if (!options.force) {
    const lastWatchdog = await getSyncMetaFresh(LAST_WATCHDOG_AT_KEY)
    const watchdogAge = parseAgeMs(lastWatchdog, nowMs)
    if (watchdogAge != null && watchdogAge < INCREMENTAL_WATCHDOG_COOLDOWN_MS) {
      return {
        action: 'cooldown',
        lastIncrementalSync,
        ageMs,
        detail: `watchdog cooldown (${Math.round(watchdogAge / 60_000)}m ago)`,
      }
    }
  }

  const startedAt = new Date().toISOString()
  await setSyncMetaDurable(LAST_WATCHDOG_AT_KEY, startedAt)

  if (!isServerlessRuntime()) {
    try {
      const { runIncrementalSyncListingsWork } = await import(
        '@/lib/netlify-sync-listings-work'
      )
      const result = await runIncrementalSyncListingsWork(startedAt, {
        source: 'admin',
      })
      return {
        action: 'ran_local',
        lastIncrementalSync,
        ageMs,
        detail: `local watchdog ran (HTTP ${result.status})`,
      }
    } catch (err) {
      return {
        action: 'queue_failed',
        lastIncrementalSync,
        ageMs,
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }

  const queued = await queueNetlifyIncrementalSync(startedAt, {
    source: 'watchdog',
  })

  if (queued.ok) {
    await setSyncMetaDurable('last_incremental_sync_started', startedAt)
    await stampIncrementalSyncLive({
      phase: 'queued',
      town: null,
      townIndex: null,
      updatedAt: startedAt,
      scopeTowns: undefined,
      statusScope: 'all',
    })
    try {
      const { stampIncrementalQueuedStepLog } = await import(
        '@/lib/incremental-sync-step-log'
      )
      await stampIncrementalQueuedStepLog(
        'watchdog-queue',
        queued.base
          ? `${queued.base} HTTP ${queued.status ?? '—'}`
          : 'background worker',
      )
    } catch (err) {
      console.warn('[incremental-watchdog] step log queue stamp failed', err)
    }
  }

  try {
    await recordSyncRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      town: '(watchdog)',
      statusBucket: 'cron/incremental',
      listingsCount: 0,
      ok: queued.ok,
      error: queued.ok
        ? `watchdog queued worker — last sync age ${
            ageMs == null ? 'never' : `${Math.round(ageMs / 60_000)}m`
          }`
        : `watchdog queue failed: ${queued.error ?? 'unknown'}`,
    })
  } catch {
    /* ignore */
  }

  if (!queued.ok) {
    return {
      action: 'queue_failed',
      lastIncrementalSync,
      ageMs,
      detail: queued.error ?? 'queue failed',
    }
  }

  return {
    action: 'queued',
    lastIncrementalSync,
    ageMs,
    detail: `${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`,
  }
}
