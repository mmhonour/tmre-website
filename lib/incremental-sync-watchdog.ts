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

import {
  INCREMENTAL_SYNC_STALE_MS,
} from '@/lib/incremental-sync-health'
import {
  SYNC_QUEUE_PRIORITY_MANUAL,
  isSyncQueueRunnerJob,
  syncQueueItemForJob,
} from '@/lib/sync-queue-shared'

export { INCREMENTAL_SYNC_STALE_MS }
/** Don't re-queue watchdog more often than this (avoids stampede). */
export const INCREMENTAL_WATCHDOG_COOLDOWN_MS = 12 * 60 * 1000

const LAST_WATCHDOG_AT_KEY = 'last_incremental_watchdog_at'

export type IncrementalWatchdogResult = {
  action:
    | 'fresh'
    | 'paused'
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
 * The sync queue is consulted first: a claimed row is a child mid-pull, so the
 * watchdog leaves it alone rather than starting a duplicate somewhere else.
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

  // The sync runner owns RETS. Ask the queue what it is doing before reaching
  // for a Netlify worker: a claimed row means a child is pulling right now, and
  // a waiting row with a live runner means it is about to. Only a silent runner
  // sends us down the Netlify path — that is the automatic version of what the
  // Configure Scheduler radio used to make somebody do by hand.
  if (isSyncQueueRunnerJob('incremental')) {
    const { enqueueSyncJob, readSyncQueueSnapshot } = await import(
      '@/lib/sync-queue'
    )
    const snapshot = await readSyncQueueSnapshot(1)
    const queueItem = syncQueueItemForJob(snapshot, 'incremental')

    if (queueItem?.state === 'running') {
      const since = queueItem.claimedAt ?? queueItem.requestedAt
      const runningForMin = Math.round(
        Math.max(0, nowMs - Date.parse(since)) / 60_000,
      )
      return {
        action: 'in_progress',
        lastIncrementalSync,
        ageMs,
        detail: `sync runner child pulling (claimed ${runningForMin}m ago)`,
      }
    }

    if (!snapshot.runnerStale) {
      if (queueItem?.state === 'queued') {
        return {
          action: 'in_progress',
          lastIncrementalSync,
          ageMs,
          detail: `already queued for the sync runner since ${queueItem.requestedAt}`,
        }
      }

      if (!options.force) {
        const lastWatchdog = await getSyncMetaFresh(LAST_WATCHDOG_AT_KEY)
        const watchdogAge = parseAgeMs(lastWatchdog, nowMs)
        if (
          watchdogAge != null &&
          watchdogAge < INCREMENTAL_WATCHDOG_COOLDOWN_MS
        ) {
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
      const enqueued = await enqueueSyncJob({
        jobId: 'incremental',
        trigger: 'watchdog',
        priority: SYNC_QUEUE_PRIORITY_MANUAL,
        requestedAt: startedAt,
        ignoreCooldown: options.force === true,
      })
      if (enqueued.ok) {
        return {
          action: 'queued',
          lastIncrementalSync,
          ageMs,
          detail: enqueued.enqueued
            ? 'queued on the sync runner'
            : (enqueued.reason ?? 'already on the queue'),
        }
      }
      return {
        action: 'queue_failed',
        lastIncrementalSync,
        ageMs,
        detail: enqueued.reason ?? 'could not enqueue incremental',
      }
    }

    console.warn(
      '[incremental-watchdog] sync runner heartbeat is stale — falling back to the Netlify worker',
    )
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
