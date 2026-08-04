import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyZipBoundariesSync } from '../../lib/netlify-sync-trigger'
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
 * Thin zip-boundary trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start time gate the work.
 * Queues sync-zip-boundaries-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfEventBridgeOwns('zip-boundaries')
      if (owned) return owned
    }
    if (await isScheduledSyncJobPausedFresh('zip-boundaries')) {
      return thinCronSkipped('zip-boundaries scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('zip-boundaries')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('zip-boundaries')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyZipBoundariesSync()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-zip-boundaries] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-zip-boundaries', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
