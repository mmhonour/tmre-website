import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyZipBoundariesSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin monthly zip-boundary trigger (NO background).
 * Queues sync-zip-boundaries-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('zip-boundaries')) {
      return thinCronSkipped('zip-boundaries scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('zip-boundaries')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
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
  // 10:00 UTC on the 1st of each month.
  schedule: '0 10 1 * *',
}
