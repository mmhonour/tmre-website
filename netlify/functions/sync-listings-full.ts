import type { Config } from '@netlify/functions'
import { getSyncStatus, syncAllTownListings } from '../../lib/listings-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Weekly full MLS → Postgres reload, including Goldilocks score rebuild.
 * Cron is 09:00 UTC Monday = 05:00 America/New_York (EST). During EDT this is
 * 5:00am Eastern Standard / 6:00am Daylight; Netlify cron is UTC-only.
 * Run manually from Admin step 1 whenever a mid-week full reload is needed.
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  if (await isScheduledSyncPausedFresh()) {
    return new Response(
      JSON.stringify({ ok: true, mode: 'full', skipped: true, reason: 'scheduled sync paused by admin' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  try {
    const catchup = await runOverdueSyncCatchup({ reason: 'netlify/sync-listings-full' })
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
    console.error('[netlify/sync-listings-full]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // 5:00 AM Eastern Standard Time on Mondays (UTC-5). During EDT this fires at 6:00 AM local.
  schedule: '0 9 * * 1',
  background: true,
}
