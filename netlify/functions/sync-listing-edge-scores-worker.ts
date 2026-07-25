import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { rebuildAllListingEdgeScores } from '../../lib/listing-edge-score'
import { readListingsDbStats } from '../../lib/db/listings-repo'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background comparable edge-score warm pass. */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-listing-edge-scores-worker',
    })
    if (await isScheduledSyncJobPausedFresh('listing-scores')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'edge-scores',
          skipped: true,
          reason: 'listing-scores scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranEdge =
      !catchup.skipped && catchup.steps.some((step) => step.job === 'edge-scores')
    const result = ranEdge ? null : await rebuildAllListingEdgeScores()
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'edge-scores',
        skippedScheduled: result == null,
        ...(result ?? { scored: 0, durationMs: 0 }),
        stats: await readListingsDbStats(),
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
    console.error('[netlify/sync-listing-edge-scores-worker]', err)
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
