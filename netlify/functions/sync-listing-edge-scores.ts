import type { Config } from '@netlify/functions'
import { rebuildAllListingEdgeScores } from '../../lib/listing-edge-score'
import { getListingsDbStats } from '../../lib/listings-db'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'

/**
 * Weekly metadata edge score rebuild for comparables ranking.
 * Cron is 07:00 UTC Monday = 02:00 America/New_York (EST). During EDT this is 3:00am local.
 */
export default async function handler() {
  try {
    const catchup = await runOverdueSyncCatchup({ reason: 'netlify/sync-listing-edge-scores' })
    const ranEdge =
      !catchup.skipped && catchup.steps.some((step) => step.job === 'edge-scores')
    const result = ranEdge ? null : await rebuildAllListingEdgeScores()
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'edge-scores',
        skippedScheduled: result == null,
        ...(result ?? { scored: 0, durationMs: 0 }),
        stats: getListingsDbStats(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
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
