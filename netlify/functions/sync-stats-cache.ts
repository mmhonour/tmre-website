import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyStatsCacheRebuild } from '../../lib/netlify-sync-trigger'
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
 * Thin stats-cache trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start gate the work.
 * Queues sync-stats-cache-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfEventBridgeOwns('stats-cache')
      if (owned) return owned
    }
    if (await isScheduledSyncJobPausedFresh('stats-cache')) {
      return thinCronSkipped('stats-cache scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('stats-cache')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('stats-cache')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyStatsCacheRebuild()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-stats-cache] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-stats-cache', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
