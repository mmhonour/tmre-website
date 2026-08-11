import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyListingScoresSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipIfEventBridgeOwns,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin Goldilocks / listing-scores trigger (NO background) — Sync 3a.
 * Dense every-30m cron; Configure Frequency/Start gate the work.
 * Queues sync-listing-scores-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfEventBridgeOwns('listing-scores')
      if (owned) return owned
    }
    if (await isScheduledSyncJobPausedFresh('listing-scores')) {
      return thinCronSkipped('listing-scores scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('listing-scores')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('listing-scores')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyListingScoresSync()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-listing-scores] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-listing-scores', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
