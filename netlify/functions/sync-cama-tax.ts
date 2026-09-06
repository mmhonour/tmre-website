import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import {
  isNetlifyQueueRateLimited,
  queueNetlifyCamaTaxSync,
} from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronHandOffToQueue,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin CAMA tax-history trigger (NO background on this function).
 * Dense every-30m cron; Configure Frequency/Start (default monthly 03:30 ET)
 * gate new work. Never-finished is due immediately.
 *
 * A due slot goes on sync_queue for the Railway runner. If that row is
 * stranded and the runner is silent, this queues sync-cama-tax-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('cama-tax')) {
      return thinCronSkipped('cama-tax scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('cama-tax')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('cama-tax')) {
      return thinCronSkipped(
        'not due yet — cama-tax Configure frequency / start time',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('cama-tax')
      if (handedOff) return handedOff
    }
    const queued = await queueNetlifyCamaTaxSync()
    if (!queued.ok) {
      if (isNetlifyQueueRateLimited(queued)) {
        return thinCronSkipped(
          'skipped — Netlify rate limited (HTTP 429), waiting to retry',
        )
      }
      console.warn(
        `[netlify/sync-cama-tax] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-cama-tax', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
