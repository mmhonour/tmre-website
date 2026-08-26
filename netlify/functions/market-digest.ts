import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { isMarketDigestAlreadySentThisWeek } from '../../lib/market-digest-config'
import { queueNetlifyMarketDigest } from '../../lib/netlify-sync-trigger'
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
 * Thin market-digest trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start time gate the work
 * (default weekly Mon 08:00 ET). Queues market-digest-worker.
 *
 * After a successful send, also skip on the week watermark so a long-running
 * worker cannot be re-queued every half hour for the rest of the day.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    {
      const owned = await thinCronSkipIfEventBridgeOwns('market-digest')
      if (owned) return owned
    }
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
    if (await isMarketDigestAlreadySentThisWeek()) {
      return thinCronSkipped('already sent for this ET week — once-per-week watermark')
    }
    const startedAt = new Date().toISOString()
    const queued = await queueNetlifyMarketDigest()
    if (!queued.ok) {
      console.warn(`[netlify/market-digest] worker queue failed: ${queued.error}`)
      // A console warning dies with the invocation. Stamp it where /admin and the
      // digest diagnostic look, or a refused hop reads as a week that never ran.
      const { recordMarketDigestHandoffFailure } = await import(
        '../../lib/market-digest-notify'
      )
      await recordMarketDigestHandoffFailure({
        startedAt,
        trigger: 'netlify-cron',
        reason: `worker handoff refused — ${queued.error ?? 'unknown'}`,
      }).catch(() => {})
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/market-digest', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
