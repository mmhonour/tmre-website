import 'server-only'

import { rebuildDealOfTheDayCache } from '@/lib/deal-of-the-day-cache'
import { isScheduledSyncJobId, type ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  queueNetlifyCpiSync,
  queueNetlifyFomcSync,
  queueNetlifyFullSync,
  queueNetlifyIncrementalSync,
  queueNetlifyListingEdgeScoreSync,
  queueNetlifyMarketDigest,
  queueNetlifyPropertyAddressSync,
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

/**
 * EventBridge Scheduler → queue the same Netlify *-worker the thin cron would.
 * Honors Configure scheduler radio, pause, and Next override defer.
 * Does not re-check Frequency “due” — EventBridge is the alarm clock.
 */
export async function dispatchEventBridgeScheduledJob(
  rawJob: unknown,
): Promise<EventBridgeDispatchResult> {
  const jobId = parseJobId(rawJob)
  if (!jobId) {
    return { ok: false, reason: 'job must be a ScheduledSyncJobId' }
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

  const startedAt = new Date().toISOString()

  if (jobId === 'deal-of-the-day') {
    try {
      const result = await rebuildDealOfTheDayCache()
      return {
        ok: true,
        jobId,
        reason: `wrote ${result.written} picks`,
      }
    } catch (err) {
      return {
        ok: false,
        jobId,
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  }

  let queue: NetlifyFunctionQueueResult

  switch (jobId) {
    case 'incremental':
      queue = await queueNetlifyIncrementalSync(startedAt, {
        source: 'eventbridge',
      })
      break
    case 'stats-cache':
      queue = await queueNetlifyStatsCacheRebuild(startedAt, {
        source: 'eventbridge',
      })
      break
    case 'full-resync':
      queue = await queueNetlifyFullSync()
      break
    case 'listing-scores':
      queue = await queueNetlifyListingEdgeScoreSync()
      break
    case 'property-addresses':
      queue = await queueNetlifyPropertyAddressSync()
      break
    case 'zip-boundaries':
      queue = await queueNetlifyZipBoundariesSync()
      break
    case 'market-digest':
      queue = await queueNetlifyMarketDigest({ source: 'eventbridge' })
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
