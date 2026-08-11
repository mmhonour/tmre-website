import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { rebuildDealOfTheDayCache } from '../../lib/deal-of-the-day-cache'
import { readListingsDbStats } from '../../lib/db/listings-repo'
import { setSyncMetaDurable } from '../../lib/db/sync-meta-store'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background Deal of the Day cache rebuild. */
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
      reason: 'netlify/sync-deal-of-the-day-worker',
    })
    if (await isScheduledSyncJobPausedFresh('deal-of-the-day')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'deal-of-the-day',
          skipped: true,
          reason: 'deal-of-the-day scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranDotd =
      !catchup.skipped &&
      catchup.steps.some((step) => step.job === 'deal-of-the-day')
    if (!ranDotd) {
      await setSyncMetaDurable('last_deal_of_the_day_cache_started', startedAt)
      const result = await rebuildDealOfTheDayCache()
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'deal-of-the-day',
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
        mode: 'deal-of-the-day',
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
    console.error('[netlify/sync-deal-of-the-day-worker]', err)
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
