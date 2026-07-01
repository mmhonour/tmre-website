import type { Config } from '@netlify/functions'
import { syncAllTownListings, getSyncStatus } from '../../lib/listings-sync'

export default async function handler() {
  try {
    const result = await syncAllTownListings()
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
  schedule: '*/30 * * * *',
}
