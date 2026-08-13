import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { getSyncStatus, syncAllTownListings } from '../../lib/listings-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'
import { isFullResyncRetired, FULL_RESYNC_RETIRED_MESSAGE } from '../../lib/scheduled-sync-jobs-shared'

/**
 * Background full MLS → Postgres reload (up to ~15 min).
 * Invoked by thin `sync-listings-full` schedule or Admin / deploy queue.
 * Not scheduled itself — schedule+background on one function is a silent no-op.
 */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  process.env.NETLIFY_SYNC_HANDLER = '1'

  try {
    await hydrateSyncMetaStore()
    if (isFullResyncRetired()) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'full',
          skipped: true,
          reason: FULL_RESYNC_RETIRED_MESSAGE,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-listings-full-worker',
    })
    if (await isScheduledSyncJobPausedFresh('full-resync')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'full',
          skipped: true,
          reason: 'full-resync scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranFull =
      !catchup.skipped && catchup.steps.some((step) => step.job === 'full-resync')
    const result = ranFull ? null : await syncAllTownListings()
    return new Response(
      JSON.stringify({
        ok: result ? result.towns.every((row) => row.ok) : true,
        mode: 'full',
        skippedScheduledFull: result == null,
        ...(result ?? { towns: [], totalUpserted: 0, durationMs: 0 }),
        stats: await getSyncStatus(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
      }),
      {
        status: result ? (result.towns.every((row) => row.ok) ? 200 : 502) : 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-listings-full-worker]', err)
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
