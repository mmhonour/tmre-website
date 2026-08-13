import 'server-only'

import { isScheduledSyncJobId, isFullResyncRetired, FULL_RESYNC_RETIRED_MESSAGE, type ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  queueNetlifyCpiSync,
  queueNetlifyDealOfTheDayRebuild,
  queueNetlifyFomcSync,
  queueNetlifyFullSync,
  queueNetlifyIncrementalSync,
  queueNetlifyListingEdgeScoreSync,
  queueNetlifyListingScoresSync,
  queueNetlifyMarketDigest,
  queueNetlifyPropertyAddressSync,
  queueNetlifyVisionAddressSync,
  queueNetlifyStatsCacheRebuild,
  queueNetlifyZipBoundariesSync,
  type NetlifyFunctionQueueResult,
} from '@/lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '@/lib/sync-next-override'
import {
  readSyncScheduleConfigFresh,
  resolveJobScheduler,
  shouldSkipScheduledJobWrongProviderFresh,
} from '@/lib/sync-schedule-config'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { stampIncrementalSyncLive } from '@/lib/incremental-sync-live'
import { stampIncrementalQueuedStepLog } from '@/lib/incremental-sync-step-log'
import { recordIncrementalQueueAudit } from '@/lib/db/listings-repo'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type EventBridgeDispatchResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  jobId?: ScheduledSyncJobId
  queue?: NetlifyFunctionQueueResult
}

function parseJobId(raw: unknown): ScheduledSyncJobId | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return isScheduledSyncJobId(trimmed) ? trimmed : null
}

export type DispatchEventBridgeOptions = {
  /**
   * Admin Dashboard Sync now when Configure Scheduler is EventBridge.
   * Still requires scheduler === eventbridge; skips pause / Next defer so the
   * button always means “run now” (same as Netlify Sync now).
   */
  fromAdminSyncNow?: boolean
}

/**
 * EventBridge Scheduler → queue the same Netlify *-worker the thin cron would.
 * Honors Configure scheduler radio, pause, and Next override defer.
 * Does not re-check Frequency “due” — EventBridge is the alarm clock.
 */
export async function dispatchEventBridgeScheduledJob(
  rawJob: unknown,
  options?: DispatchEventBridgeOptions,
): Promise<EventBridgeDispatchResult> {
  const jobId = parseJobId(rawJob)
  if (!jobId) {
    return { ok: false, reason: 'job must be a ScheduledSyncJobId' }
  }

  if (isFullResyncRetired() && jobId === 'full-resync') {
    return {
      ok: true,
      skipped: true,
      jobId,
      reason: FULL_RESYNC_RETIRED_MESSAGE,
    }
  }

  if (await shouldSkipScheduledJobWrongProviderFresh(jobId, 'eventbridge')) {
    const config = await readSyncScheduleConfigFresh()
    const provider = resolveJobScheduler(config.jobs[jobId])
    return {
      ok: false,
      skipped: true,
      jobId,
      reason: `job scheduler is ${provider} — EventBridge ignored`,
    }
  }

  if (!options?.fromAdminSyncNow) {
    if (await isScheduledSyncJobPausedFresh(jobId)) {
      return {
        ok: false,
        skipped: true,
        jobId,
        reason: 'paused by admin',
      }
    }

    if (shouldDeferScheduledJob(jobId)) {
      return {
        ok: false,
        skipped: true,
        jobId,
        reason: 'Admin Next override — not due yet',
      }
    }
  }

  const startedAt = new Date().toISOString()

  let queue: NetlifyFunctionQueueResult

  switch (jobId) {
    case 'incremental':
      queue = await queueNetlifyIncrementalSync(startedAt, {
        source: 'eventbridge',
      })
      // AWS ingress path must stamp Start/live itself. Admin Sync now stamps
      // after dispatch returns — skip here to avoid double audit rows.
      if (!options?.fromAdminSyncNow) {
        await recordIncrementalQueueAudit({
          startedAt,
          source: 'eventbridge',
          queued: queue.ok,
          detail: queue.ok
            ? `${queue.base ?? 'site'} HTTP ${queue.status ?? '—'}`
            : queue.error ?? 'unknown queue error',
        })
        if (queue.ok) {
          await setSyncMetaDurable('last_incremental_sync_started', startedAt)
          await stampIncrementalSyncLive({
            phase: 'queued',
            town: null,
            townIndex: null,
            townCount: TMRE_TOWNS.length,
            updatedAt: startedAt,
            statusScope: 'all',
          })
          await stampIncrementalQueuedStepLog(
            'eventbridge',
            queue.base
              ? `${queue.base} HTTP ${queue.status ?? '—'}`
              : 'background worker',
          )
        }
      }
      break
    case 'stats-cache':
      queue = await queueNetlifyStatsCacheRebuild(startedAt, {
        source: 'eventbridge',
      })
      if (queue.ok && !options?.fromAdminSyncNow) {
        await setSyncMetaDurable('last_stats_cache_started', startedAt)
      }
      break
    case 'full-resync':
      queue = await queueNetlifyFullSync()
      break
    case 'listing-scores':
      queue = await queueNetlifyListingScoresSync(startedAt, {
        source: 'eventbridge',
      })
      if (queue.ok && !options?.fromAdminSyncNow) {
        await setSyncMetaDurable('last_listing_scores_started', startedAt)
      }
      break
    case 'edge-scores':
      queue = await queueNetlifyListingEdgeScoreSync(startedAt, {
        source: 'eventbridge',
      })
      break
    case 'deal-of-the-day':
      queue = await queueNetlifyDealOfTheDayRebuild(startedAt, {
        source: 'eventbridge',
      })
      if (queue.ok && !options?.fromAdminSyncNow) {
        await setSyncMetaDurable('last_deal_of_the_day_cache_started', startedAt)
      }
      break
    case 'property-addresses':
      queue = await queueNetlifyPropertyAddressSync()
      break
    case 'vision-addresses':
      queue = await queueNetlifyVisionAddressSync()
      break
    case 'zip-boundaries':
      queue = await queueNetlifyZipBoundariesSync()
      break
    case 'market-digest':
      queue = await queueNetlifyMarketDigest({
        source: 'eventbridge',
        // Admin Sync now must send even off-cadence; scheduled EB keeps weekly gates.
        ...(options?.fromAdminSyncNow
          ? { force: true, stampWeek: true }
          : {}),
      })
      break
    case 'fomc-sync':
      queue = await queueNetlifyFomcSync({ source: 'eventbridge' })
      break
    case 'cpi-sync':
      queue = await queueNetlifyCpiSync({ source: 'eventbridge' })
      break
    default: {
      const _exhaustive: never = jobId
      return { ok: false, reason: `unsupported job ${_exhaustive}` }
    }
  }

  return {
    ok: queue.ok,
    jobId,
    queue,
    reason: queue.ok ? undefined : queue.error,
  }
}
