import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { hydrateSyncMetaStore, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { recordSyncRun } from '@/lib/db/listings-repo'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'
import { queueNetlifyIncrementalSync } from '@/lib/netlify-sync-trigger'
import { isServerlessRuntime } from '@/lib/runtime-host'

/** If last successful incremental is older than this, force a worker queue. */
export const INCREMENTAL_SYNC_STALE_MS = 70 * 60 * 1000
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

  const startedIso = await getSyncMetaFresh('last_incremental_sync_started')
  const startedAge = parseAgeMs(startedIso, nowMs)
  // A run started < 20m ago may still be in the 15m worker — don't double-queue.
  if (
    startedAge != null &&
    startedAge < 20 * 60 * 1000 &&
    (ageMs == null || (startedIso && lastIncrementalSync && startedIso > lastIncrementalSync))
  ) {
    return {
      action: 'in_progress',
      lastIncrementalSync,
      ageMs,
      detail: `incremental started ${Math.round((startedAge ?? 0) / 60_000)}m ago — waiting`,
    }
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
    // Same Start + live breadcrumb as cron/admin queue — otherwise Dashboard
    // keeps the prior End and never shows Queued for watchdog-driven hops.
    await setSyncMetaDurable('last_incremental_sync_started', startedAt)
    const { stampIncrementalSyncLive } = await import(
      '@/lib/incremental-sync-live'
    )
    await stampIncrementalSyncLive({
      phase: 'queued',
      town: null,
      townIndex: null,
      updatedAt: startedAt,
    })
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
