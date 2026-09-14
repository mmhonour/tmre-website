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
 * Thin hero-photos trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start (default every 15m)
 * gate the work. A due slot goes on sync_queue for the Railway runner —
 * Media/R2 photo bodies must not download inside a Netlify invoke.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('hero-photos')) {
      return thinCronSkipped('hero-photos scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('hero-photos')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('hero-photos')) {
      return thinCronSkipped(
        'not due yet — hero-photos Configure frequency / start time',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('hero-photos')
      if (handedOff) return handedOff
    }
    return thinCronSkipped(
      'sync runner did not claim hero-photos — will retry next tick',
    )
  } catch (err) {
    return thinCronError('netlify/sync-hero-photos', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
