import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyPropertyAddressSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin weekly property-address trigger (NO background).
 * Queues sync-property-addresses-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('property-addresses')) {
      return thinCronSkipped('property-addresses scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('property-addresses')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    const queued = await queueNetlifyPropertyAddressSync()
    if (!queued.ok) {
      console.warn(
        `[netlify/sync-property-addresses] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-property-addresses', err)
  }
}

export const config: Config = {
  // 1:00 AM Eastern Standard Time on Mondays (UTC-5). During EDT this is 2:00am local.
  schedule: '0 6 * * 1',
}
