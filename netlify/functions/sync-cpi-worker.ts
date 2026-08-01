import type { Config, Context } from '@netlify/functions'
import {
  getSyncMeta,
  hydrateSyncMetaStore,
  setSyncMetaDurable,
} from '../../lib/db/sync-meta-store'
import { runCpiReleaseSync } from '../../lib/cpi-release-sync'
import { cpiSyncDueRelease } from '../../lib/fed-event-sync-schedule'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { readSyncScheduleConfig } from '../../lib/sync-schedule-config'

/** Background BLS CPI release scrape for /fed-analysis. */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await hydrateSyncMetaStore()
    const body = (await req.json().catch(() => ({}))) as {
      source?: string
    }
    const fromAdmin = body.source === 'admin'

    if (!fromAdmin && (await isScheduledSyncJobPausedFresh('cpi-sync'))) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'cpi-sync scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const start =
      readSyncScheduleConfig().jobs['cpi-sync']?.startTimeEt ?? '09:15'
    const due = fromAdmin
      ? null
      : cpiSyncDueRelease(
          undefined,
          new Date(),
          start,
          getSyncMeta('cpi_last_synced_event_id'),
        )

    const result = await runCpiReleaseSync(
      due ? { releaseId: due.id } : undefined,
    )

    if (result.ok || result.updated > 0) {
      const eventId =
        due?.id ??
        result.releases.find((r) => r.ok && !r.skipped)?.id ??
        null
      if (eventId) {
        await setSyncMetaDurable('cpi_last_synced_event_id', eventId)
      }
    }

    return new Response(
      JSON.stringify({
        ok: result.ok,
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
    console.error('[netlify/sync-cpi-worker]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  background: true,
}
