import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyFullSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin full-reload trigger (NO background) — must finish in ~30s.
 * Dense every-30m cron; Configure Frequency/Start time decide when work runs.
 * Queues sync-listings-full-worker for the real MLS work.
 *
 * Do NOT put schedule+background on one function (silent no-op on Netlify).
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('full-resync')) {
      return thinCronSkipped('full-resync scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('full-resync')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('full-resync')) {
      return thinCronSkipped('not due yet — Configure frequency / start time')
    }
    const queued = await queueNetlifyFullSync()
    if (queued.ok) {
      console.info(
        `[netlify/sync-listings-full] queued worker via ${queued.base} (HTTP ${queued.status})`,
      )
    } else {
      console.warn(
        `[netlify/sync-listings-full] worker queue failed: ${queued.error}`,
      )
    }
    return thinCronResponse(queued)
  } catch (err) {
    return thinCronError('netlify/sync-listings-full', err)
  }
}

export const config: Config = {
  // Dense wake; Admin Configure Frequency/Start time gate the real work.
  // Literal cron. Do NOT set background: true on this function.
  schedule: '*/30 * * * *',
}
