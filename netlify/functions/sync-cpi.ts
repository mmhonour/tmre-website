import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyCpiSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin CPI release sync trigger (NO background).
 * Dense every-30m cron; runs only on BLS CPI release day after Configure
 * start time (default 09:15 ET). Queues sync-cpi-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('cpi-sync')) {
      return thinCronSkipped('cpi-sync scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('cpi-sync')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('cpi-sync')) {
      return thinCronSkipped(
        'not due yet — waiting for CPI release day @ Configure start time ET',
      )
    }
    const queued = await queueNetlifyCpiSync()
    if (!queued.ok) {
      console.warn(`[netlify/sync-cpi] worker queue failed: ${queued.error}`)
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-cpi', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
