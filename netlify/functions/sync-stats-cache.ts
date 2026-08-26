import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import {
  isNetlifyQueueRateLimited,
  queueNetlifyStatsCacheRebuild,
} from '../../lib/netlify-sync-trigger'
import {
  isStatsCacheQueueBackedOff,
  reasonToSkipStatsCacheRebuild,
  stampStatsCacheQueueBackoff,
} from '../../lib/stats-cache'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronHandOffToQueue,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin stats-cache trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start gate the work.
 *
 * A due rebuild goes on the sync queue for the always-on runner, which can
 * outlast a serverless slot. This function only queues sync-stats-cache-worker
 * when that row has been stranded long enough to prove the runner is gone.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
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
    const skipReason = await reasonToSkipStatsCacheRebuild()
    if (skipReason) return thinCronSkipped(skipReason)
    // Don't spend a background invocation when no town changed — that hop is
    // exactly what Netlify started refusing with HTTP 429.
    const { statsTownsDueForRebuild } = await import('../../lib/stats-dirty-towns')
    const due = await statsTownsDueForRebuild()
    if (due.towns.length === 0) {
      return thinCronSkipped('no dirty towns — nothing to rebuild')
    }
    {
      const handedOff = await thinCronHandOffToQueue('stats-cache')
      if (handedOff) return handedOff
    }
    if (await isStatsCacheQueueBackedOff()) {
      return thinCronSkipped(
        'skipped — Netlify rate limited (HTTP 429), waiting to retry',
      )
    }
    const queued = await queueNetlifyStatsCacheRebuild(undefined, {
      source: 'cron',
    })
    if (!queued.ok) {
      if (isNetlifyQueueRateLimited(queued)) {
        await stampStatsCacheQueueBackoff()
        return thinCronSkipped(
          'skipped — Netlify rate limited (HTTP 429), waiting to retry',
        )
      }
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
