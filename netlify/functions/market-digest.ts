import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyMarketDigest } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin market-digest trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start time gate the work
 * (default weekly Mon 08:00 ET). Queues market-digest-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('market-digest')) {
      return thinCronSkipped('market-digest scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('market-digest')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('market-digest')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyMarketDigest()
    if (!queued.ok) {
      console.warn(`[netlify/market-digest] worker queue failed: ${queued.error}`)
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/market-digest', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
