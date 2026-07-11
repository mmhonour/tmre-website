import type { Config } from '@netlify/functions'
import { getSyncStatus, syncIncrementalListings } from '../../lib/listings-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { LATEST_DB_REFRESH_MS } from '../../lib/latest-refresh'

export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  const { ensureAdminSqliteDatabasesReady } = await import('../../lib/listings-db-persist')
  const { resetListingsDbConnections } = await import('../../lib/listings-db')
  await ensureAdminSqliteDatabasesReady(resetListingsDbConnections)

  try {
    const catchup = await runOverdueSyncCatchup({ reason: 'netlify/sync-listings' })
    const result = await syncIncrementalListings()
    return new Response(
      JSON.stringify({
        ok: result.towns.every((row) => row.ok),
        ...result,
        stats: getSyncStatus(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
      }),
      {
        status: result.towns.every((row) => row.ok) ? 200 : 502,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-listings]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // Incremental RETS → SQLite sync every 30 minutes (full sync when last_full_sync
  // is older than 24h — prefer the dedicated daily 5am sync-listings-full function).
  schedule: `*/${Math.max(1, Math.round(LATEST_DB_REFRESH_MS / 60_000))} * * * *`,
  background: true,
}
