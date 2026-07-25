import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { syncPropertyAddresses } from '../../lib/property-address-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background property-address directory verify + enrich. */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-property-addresses-worker',
    })
    if (await isScheduledSyncJobPausedFresh('property-addresses')) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'property-addresses scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranAddresses =
      !catchup.skipped &&
      catchup.steps.some((step) => step.job === 'property-addresses')
    const result = ranAddresses ? null : await syncPropertyAddresses()
    return new Response(
      JSON.stringify(
        result ?? {
          ok: true,
          skippedScheduled: true,
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        },
      ),
      {
        status: result?.ok === false ? 502 : 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-property-addresses-worker]', err)
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
