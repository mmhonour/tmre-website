import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyFomcSync } from '../../lib/netlify-sync-trigger'
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
 * Thin FOMC statement sync trigger (NO background).
 * Dense every-30m cron; runs only on FOMC decision day after Configure
 * start time (default 15:15 ET). Queues sync-fomc-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfEventBridgeOwns('fomc-sync')
      if (owned) return owned
    }
    if (await isScheduledSyncJobPausedFresh('fomc-sync')) {
      return thinCronSkipped('fomc-sync scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('fomc-sync')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('fomc-sync')) {
      return thinCronSkipped(
        'not due yet — waiting for FOMC decision day @ Configure start time ET',
      )
    }
    const queued = await queueNetlifyFomcSync()
    if (!queued.ok) {
      console.warn(`[netlify/sync-fomc] worker queue failed: ${queued.error}`)
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-fomc', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
