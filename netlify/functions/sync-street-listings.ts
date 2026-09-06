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
 * Thin street-listings trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start (default weekly Wed 02:00 ET)
 * gate the work. Leftover unlinked /streets addresses older than 6h are also
 * due so chunks keep filling between other runner jobs.
 *
 * There is no Netlify worker: a due slot goes on sync_queue for the Railway
 * runner.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('street-listings')) {
      return thinCronSkipped('street-listings scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('street-listings')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    const { streetListingsNeedCatchUp } = await import(
      '../../lib/street-listings-sync'
    )
    const catchUp = await streetListingsNeedCatchUp()
    if (!catchUp && shouldSkipScheduledJobNotDue('street-listings')) {
      return thinCronSkipped(
        'not due yet — street-listings Configure frequency / start time',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('street-listings')
      if (handedOff) return handedOff
    }
    return thinCronSkipped(
      'sync runner did not claim street-listings — will retry next tick',
    )
  } catch (err) {
    return thinCronError('netlify/sync-street-listings', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
