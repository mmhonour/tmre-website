import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { runAdminSyncAction } from '../../lib/admin-sync-actions'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Background CAMA tax-history rebuild. Used when the Railway runner is silent
 * and a queued row has sat long enough to prove it will never be claimed.
 */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    if (await isScheduledSyncJobPausedFresh('cama-tax')) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'cama-tax',
          skipped: true,
          reason: 'cama-tax scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await runAdminSyncAction('cama-tax', {
      executeInProcess: true,
    })
    return new Response(JSON.stringify({ mode: 'cama-tax', ...result }), {
      status: result.ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/sync-cama-tax-worker]', err)
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
