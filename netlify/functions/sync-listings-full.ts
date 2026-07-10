import type { Config } from '@netlify/functions'
import { getSyncStatus, syncAllTownListings } from '../../lib/listings-sync'

/**
 * Daily full MLS → SQLite reload, including Goldilocks score rebuild.
 * Cron is 09:00 UTC = 05:00 America/New_York (EST). During EDT this is 5:00am
 * Eastern Standard / 6:00am Daylight; Netlify cron is UTC-only.
 */
export default async function handler() {
  try {
    const result = await syncAllTownListings()
    return new Response(
      JSON.stringify({
        ok: result.towns.every((row) => row.ok),
        mode: 'full',
        ...result,
        stats: getSyncStatus(),
      }),
      {
        status: result.towns.every((row) => row.ok) ? 200 : 502,
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
