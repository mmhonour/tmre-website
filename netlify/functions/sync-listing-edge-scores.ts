import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyListingEdgeScoreSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipListingEdgeScoresNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin edge-score trigger (NO background).
 * Dense every-30m cron; listing-scores Configure Frequency/Start gate the work,
 * but due-ness uses last_listing_edge_scores (not Goldilocks End). Always
 * Netlify-owned — EventBridge on listing-scores must not suppress this cron.
 * Queues sync-listing-edge-scores-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('listing-scores')) {
      return thinCronSkipped('listing-scores scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('listing-scores')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipListingEdgeScoresNotDue()) {
      return thinCronSkipped(
        'not due yet — edge scores cadence (last_listing_edge_scores)',
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
