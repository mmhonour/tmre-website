import type { Config, Context } from '@netlify/functions'
import {
  getSyncMeta,
  hydrateSyncMetaStore,
  setSyncMetaDurable,
} from '../../lib/db/sync-meta-store'
import { fomcSyncDueMeeting } from '../../lib/fed-event-sync-schedule'
import { runFedFomcSync } from '../../lib/fed-fomc-sync'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { readSyncScheduleConfig } from '../../lib/sync-schedule-config'

/** Background FOMC statement scrape for /fed-analysis. */
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

    if (!fromAdmin && (await isScheduledSyncJobPausedFresh('fomc-sync'))) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'fomc-sync scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const start =
      readSyncScheduleConfig().jobs['fomc-sync']?.startTimeEt ?? '15:15'
    const due = fromAdmin
      ? null
      : fomcSyncDueMeeting(
          undefined,
          new Date(),
          start,
          getSyncMeta('fomc_last_synced_event_id'),
        )

    const result = await runFedFomcSync(
      due ? { meetingId: due.id } : undefined,
    )

    if (result.ok || result.updated > 0) {
      const eventId =
        due?.id ??
        result.meetings.find((m) => m.ok && !m.skipped)?.id ??
        null
      if (eventId) {
        await setSyncMetaDurable('fomc_last_synced_event_id', eventId)
      }
    }

    return new Response(
      JSON.stringify({
        ok: result.ok,
        meetingId: due?.id ?? null,
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
    console.error('[netlify/sync-fomc-worker]', err)
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
