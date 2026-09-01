import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyListingEdgeScoreSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin edge-score trigger (NO background) — Sync 3b.
 * Dense every-30m cron; edge-scores Configure Frequency/Start gate the work.
 * Finish stamp is last_listing_edge_scores. Queues sync-listing-edge-scores-worker.
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
    const queued = await queueNetlifyListingEdgeScoreSync()
    if (!queued.ok) {
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
