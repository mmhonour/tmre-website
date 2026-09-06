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
 * Thin CAMA tax-history trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start (default monthly 03:30 ET)
 * gate the work. Never-finished is due immediately.
 *
 * There is no Netlify worker: a due slot goes on sync_queue for the Railway
 * runner. If that row is stranded this function says so and retries next tick
 * rather than starting a monthly job in a 26s slot.
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
    return thinCronSkipped(
      'sync runner did not claim cama-tax — will retry next tick',
    )
  } catch (err) {
    return thinCronError('netlify/sync-cama-tax', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
