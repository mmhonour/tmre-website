import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyVisionAddressSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin vision-addresses trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start time gate the work.
 * Queues sync-vision-addresses-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('vision-addresses')) {
      return thinCronSkipped('vision-addresses scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('vision-addresses')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('vision-addresses')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyVisionAddressSync()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-vision-addresses] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-vision-addresses', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
