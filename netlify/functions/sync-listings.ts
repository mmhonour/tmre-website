import type { Config } from '@netlify/functions'
import { getSyncStatus, syncListingsSmart } from '../../lib/listings-sync'
import { LATEST_DB_REFRESH_MS } from '../../lib/latest-refresh'

export default async function handler() {
  try {
    const result = await syncListingsSmart()
    return new Response(
      JSON.stringify({
        ok: result.towns.every((row) => row.ok),
        ...result,
        stats: getSyncStatus(),
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
}
