import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import {
  isNetlifyQueueRateLimited,
  queueNetlifyListingEdgeScoreSync,
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
 * Thin edge-score trigger (NO background) — Sync 3b.
 * Dense every-30m cron; edge-scores Configure Frequency/Start gate the work.
 *
 * A due rebuild goes on the sync queue for the always-on runner; this function
 * only queues sync-listing-edge-scores-worker when that row is stranded.
 * Finish stamp is last_listing_edge_scores.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('edge-scores')) {
      return thinCronSkipped('edge-scores scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('edge-scores')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('edge-scores')) {
      return thinCronSkipped(
        'not due yet — edge-scores Configure frequency / start time',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('edge-scores')
      if (handedOff) return handedOff
    }
    const queued = await queueNetlifyListingEdgeScoreSync()
    if (!queued.ok) {
      if (isNetlifyQueueRateLimited(queued)) {
        return thinCronSkipped(
          'skipped — Netlify rate limited (HTTP 429), waiting to retry',
        )
      }
      console.warn(
        `[netlify/sync-listing-edge-scores] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-listing-edge-scores', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
