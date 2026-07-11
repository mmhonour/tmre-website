import type { Config } from '@netlify/functions'
import { getSyncStatus, syncAllTownListings } from '../../lib/listings-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'

/**
 * Daily full MLS → SQLite reload, including Goldilocks score rebuild.
 * Cron is 09:00 UTC = 05:00 America/New_York (EST). During EDT this is 5:00am
 * Eastern Standard / 6:00am Daylight; Netlify cron is UTC-only.
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  const { ensureAdminSqliteDatabasesReady } = await import('../../lib/listings-db-persist')
  const { resetListingsDbConnections } = await import('../../lib/listings-db')
  await ensureAdminSqliteDatabasesReady(resetListingsDbConnections)

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
        stats: getSyncStatus(),
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
  // 5:00 AM Eastern Standard Time (UTC-5). During EDT this fires at 6:00 AM local.
  schedule: '0 9 * * *',
  background: true,
}
