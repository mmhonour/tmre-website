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
  thinCronResponse,
  thinCronSkipIfAnotherHostOwns,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin stats-cache trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start gate the work.
 * Queues sync-stats-cache-worker — only while Configure says Netlify owns the
 * job. Default is Railway, whose always-on process can finish a full rebuild.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfAnotherHostOwns('stats-cache')
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
    /**
     * Reaching here means Configure still says Netlify owns stats-cache — the
     * provider guard above stands this cron down when Railway does. No
     * cross-host fallback: one declared owner, and a visible failure otherwise.
     */
    const skipReason = await reasonToSkipStatsCacheRebuild()
    if (skipReason) return thinCronSkipped(skipReason)
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
