import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronHandOffToQueue,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin db-size trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start (default daily 06:00 ET)
 * gate the work. A due slot goes on sync_queue for the Railway runner —
 * the growth scan is longer than a Netlify scheduled-function budget.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('db-size')) {
      return thinCronSkipped('db-size scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('db-size')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('db-size')) {
      return thinCronSkipped(
        'not due yet — db-size Configure frequency / start time',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('db-size')
      if (handedOff) return handedOff
    }
    return thinCronSkipped(
      'sync runner did not claim db-size — will retry next tick',
    )
  } catch (err) {
    return thinCronError('netlify/sync-db-size', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
