import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { rebuildStatsCache } from '../../lib/stats-cache'
import { readListingsDbStats } from '../../lib/db/listings-repo'
import { setSyncMetaDurable } from '../../lib/db/sync-meta-store'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background stats_cache rebuild. */
export default async function handler(req: Request, _context: Context) {
  let startedAt = new Date().toISOString()
  try {
    const body = (await req.json().catch(() => null)) as {
      startedAt?: string
    } | null
    if (body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))) {
      startedAt = body.startedAt
    }
  } catch {
    /* ignore */
  }

  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-stats-cache-worker',
    })
    if (await isScheduledSyncJobPausedFresh('stats-cache')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'stats-cache',
          skipped: true,
          reason: 'stats-cache scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranStats =
      !catchup.skipped &&
      catchup.steps.some((step) => step.job === 'stats-cache')
    if (!ranStats) {
      await setSyncMetaDurable('last_stats_cache_started', startedAt)
      const result = await rebuildStatsCache({ trackRefresh: true, force: true })
      return new Response(
        JSON.stringify({
          ok: !result.skipped && result.written > 0,
          mode: 'stats-cache',
          ...result,
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
    }
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'stats-cache',
        skippedScheduled: true,
        overdueCatchup: {
          skipped: false,
          plan: catchup.plan,
          steps: catchup.steps,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error('[netlify/sync-stats-cache-worker]', err)
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
