import type { Config } from '@netlify/functions'
import { rebuildAllListingEdgeScores } from '../../lib/listing-edge-score'
import { getListingsDbStats } from '../../lib/listings-db'

/**
 * Weekly metadata edge score rebuild for comparables ranking.
 * Cron is 07:00 UTC Monday = 02:00 America/New_York (EST). During EDT this is 3:00am local.
 */
export default async function handler() {
  try {
    const result = rebuildAllListingEdgeScores()
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'edge-scores',
        ...result,
        stats: getListingsDbStats(),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-listing-edge-scores]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // 2:00 AM Eastern Standard Time (UTC-5) on Mondays.
  schedule: '0 7 * * 1',
  background: true,
}
