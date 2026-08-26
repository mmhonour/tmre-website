import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyDealOfTheDayRebuild } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronHandOffToQueue,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin Deal of the Day trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start gate the work.
 *
 * A due rebuild goes on the sync queue for the always-on runner; this function
 * only queues sync-deal-of-the-day-worker when that row is stranded.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('deal-of-the-day')) {
      return thinCronSkipped('deal-of-the-day scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('deal-of-the-day')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('deal-of-the-day')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    {
      const handedOff = await thinCronHandOffToQueue('deal-of-the-day')
      if (handedOff) return handedOff
    }
    const queued = await queueNetlifyDealOfTheDayRebuild()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-deal-of-the-day] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-deal-of-the-day', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
