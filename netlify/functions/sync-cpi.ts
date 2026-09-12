import type { Config } from '@netlify/functions'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { queueNetlifyCpiSync } from '../../lib/netlify-sync-trigger'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { shouldDeferScheduledJob } from '../../lib/sync-next-override'
import { shouldSkipScheduledJobNotDue } from '../../lib/sync-schedule-config'
import {
  thinCronError,
  thinCronResponse,
  thinCronSkipped,
} from '../../lib/netlify-thin-cron'

/**
 * Thin CPI release sync trigger (NO background).
 * Dense every-30m cron; runs only on BLS CPI release day after Configure
 * start time (default 09:15 ET). Queues sync-cpi-worker.
 */
export default async function handler() {
  try {
    await hydrateSyncMetaStore()
    if (await isScheduledSyncJobPausedFresh('cpi-sync')) {
      return thinCronSkipped('cpi-sync scheduled sync paused by admin')
    }
    if (shouldDeferScheduledJob('cpi-sync')) {
      return thinCronSkipped(
        'deferred — Admin Next override is still in the future',
      )
    }
    if (shouldSkipScheduledJobNotDue('cpi-sync')) {
      return thinCronSkipped(
        'not due yet — waiting for CPI release day @ Configure start time ET',
      )
    }
    const queued = await queueNetlifyCpiSync()
    if (queued.ok) return thinCronResponse(queued)

    const { isNetlifyQueueRateLimited } = await import(
      '../../lib/netlify-sync-trigger'
    )
    if (!isNetlifyQueueRateLimited(queued)) {
      console.warn(`[netlify/sync-cpi] worker queue failed: ${queued.error}`)
      return thinCronResponse(queued)
    }

    // Background hop is refused site-wide (HTTP 429). CPI is a short BLS
    // scrape — run it here rather than wait a month for the next print day.
    const { getSyncMeta } = await import('../../lib/db/sync-meta-store')
    const { cpiSyncDueRelease } = await import(
      '../../lib/fed-event-sync-schedule'
    )
    const { readSyncScheduleConfig } = await import(
      '../../lib/sync-schedule-config'
    )
    const { runCpiReleaseSync, stampCpiSyncSuccess } = await import(
      '../../lib/cpi-release-sync'
    )
    const start =
      readSyncScheduleConfig().jobs['cpi-sync']?.startTimeEt ?? '09:15'
    const due = cpiSyncDueRelease(
      undefined,
      new Date(),
      start,
      getSyncMeta('cpi_last_synced_event_id'),
    )
    const result = await runCpiReleaseSync(
      due ? { releaseId: due.id } : undefined,
    )
    await stampCpiSyncSuccess(result, due?.id)
    return new Response(
      JSON.stringify({
        ok: result.ok,
        mode: 'inline-after-429',
        releaseId: due?.id ?? null,
        fetched: result.fetched,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      }),
      {
        status: result.ok ? 200 : 207,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    return thinCronError('netlify/sync-cpi', err)
  }
}

export const config: Config = {
  schedule: '*/30 * * * *',
}
