import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { syncVisionAddresses } from '../../lib/vision-gis-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background Vision GIS cadastral crawl → vision_addresses.field_card JSON (+ R2 HTML pointer). */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const catchup = await runOverdueSyncCatchup({
      reason: 'netlify/sync-vision-addresses-worker',
    })
    if (await isScheduledSyncJobPausedFresh('vision-addresses')) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'vision-addresses scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const ranVision =
      !catchup.skipped &&
      catchup.steps.some((step) => step.job === 'vision-addresses')
    const result = ranVision ? null : await syncVisionAddresses()
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
    console.error('[netlify/sync-vision-addresses-worker]', err)
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
