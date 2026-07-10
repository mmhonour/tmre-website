import type { Config } from '@netlify/functions'
import { syncPropertyAddresses } from '../../lib/property-address-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'

/**
 * Weekly property-address directory verify + enrich.
 * Cron is 06:00 UTC Monday = 01:00 America/New_York (EST). During EDT this is 2:00am local.
 */
export default async function handler() {
  try {
    const catchup = await runOverdueSyncCatchup({ reason: 'netlify/sync-property-addresses' })
    const ranAddresses =
      !catchup.skipped && catchup.steps.some((step) => step.job === 'property-addresses')
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
    console.error('[netlify/sync-property-addresses]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  schedule: '0 6 * * 1',
  background: true,
}
