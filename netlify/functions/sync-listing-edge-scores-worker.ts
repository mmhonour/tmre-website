import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { rebuildAllListingEdgeScores } from '../../lib/listing-edge-score'
import { readListingsDbStats } from '../../lib/db/listings-repo'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background comparable edge-score warm pass (Sync 3b). Always rebuilds — catch-up queue ≠ done. */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    if (await isScheduledSyncJobPausedFresh('edge-scores')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'edge-scores',
          skipped: true,
          reason: 'edge-scores scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await rebuildAllListingEdgeScores()
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'edge-scores',
        ...result,
        stats: await readListingsDbStats(),
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
