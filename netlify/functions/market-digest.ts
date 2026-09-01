import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { shouldSkipMarketDigestNotDue } from '../../lib/market-digest-config'
import { queueNetlifyMarketDigest } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import {
  thinCronError,
  thinCronResponse,
  thinCronHandOffToQueue,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin market-digest trigger (NO background).
 * Dense every-30m cron; Configure Frequency/Start time gate the work
 * (default weekly Mon 08:00 ET).
 *
 * A due send goes on the sync queue for the always-on runner, which is awake to
 * retry through the day; market-digest-worker is queued here only when that row
 * is stranded.
 *
 * Dedupe is the slot itself: once a send stamps last-sent at or after the current
 * slot, the job stops being due, so the dense alarm cannot re-queue it.
 */

/**
 * Stand down, but on the record. Repeats collapse to a stamp rather than a
 * History row, so the every-30m alarm reports one line per distinct reason.
 */
async function recordedSkip(reason: string): Promise<Response> {
  const { recordMarketDigestSkip } = await import(
    '../../lib/market-digest-notify'
  )
  await recordMarketDigestSkip({ trigger: 'netlify-cron', reason }).catch(
    () => {},
  )
  return thinCronSkipped(reason)
}

export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('market-digest')) {
      return recordedSkip('market-digest scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('market-digest')) {
      return recordedSkip(
        'deferred — Admin Next override is still in the future',
      )
    }
    // One rule, read fresh: the configured slot versus the last send. A sibling
    // host may have sent since this process hydrated its cache, so the cached
    // check alone would re-queue a brief that already went out.
    if (await shouldSkipMarketDigestNotDue()) {
      return recordedSkip(
        'not due — Configure day / start time, or already sent for this slot',
      )
    }
    {
      const handedOff = await thinCronHandOffToQueue('market-digest')
      if (handedOff) return handedOff
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
