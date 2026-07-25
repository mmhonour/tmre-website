import type { Config } from '@netlify/functions'
import { queueNetlifyListingEdgeScoreSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin weekly edge-score trigger (NO background).
 * Queues sync-listing-edge-scores-worker.
 */
export default async function handler() {
  try {
    if (await isScheduledSyncJobPausedFresh('listing-scores')) {
      return thinCronSkipped('listing-scores scheduled sync paused by admin')
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
  // 2:00 AM Eastern Standard Time (UTC-5) on Mondays.
  schedule: '0 7 * * 1',
}
