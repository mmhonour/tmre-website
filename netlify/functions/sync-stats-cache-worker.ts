import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { rebuildStatsCache, rebuildStatsCacheForTowns } from '../../lib/stats-cache'
import { statsTownsDueForRebuild } from '../../lib/stats-dirty-towns'
import { readListingsDbStats } from '../../lib/db/listings-repo'
import { setSyncMetaDurable } from '../../lib/db/sync-meta-store'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Background stats_cache rebuild — the Netlify half of the Configure radio.
 *
 * Rebuilds the towns the incremental sync marked dirty (plus the 24h backstop).
 * `all: true` in the body forces the whole cache: that is the Admin "Sync now"
 * path, where the operator does not want to trust the dirty marks.
 */
export default async function handler(req: Request, _context: Context) {
  let startedAt = new Date().toISOString()
  let rebuildAll = false
  try {
    const body = (await req.json().catch(() => null)) as {
      startedAt?: string
      all?: boolean
      source?: string
    } | null
    if (body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))) {
      startedAt = body.startedAt
    }
    rebuildAll = body?.all === true || body?.source === 'admin'
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
    if (await isScheduledSyncJobPausedFresh('stats-cache')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'stats-cache',
          skipped: true,
          reason: 'stats-cache scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const due = rebuildAll ? null : await statsTownsDueForRebuild()
    if (due && due.towns.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'stats-cache',
          skipped: true,
          reason: 'no dirty towns — nothing to rebuild',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    await setSyncMetaDurable('last_stats_cache_started', startedAt)
    const result = due
      ? await rebuildStatsCacheForTowns(due.towns, {
          trackRefresh: true,
          force: true,
          trigger: 'netlify-worker',
          reasons: due.reasons,
        })
      : await rebuildStatsCache({
          trackRefresh: true,
          force: true,
          trigger: 'netlify-worker (all)',
        })
    return new Response(
      JSON.stringify({
        ok: !result.skipped && result.written > 0,
        mode: 'stats-cache',
        towns: due ? due.towns : 'all',
        ...result,
        stats: await readListingsDbStats(),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
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
