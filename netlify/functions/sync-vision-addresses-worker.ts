import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { syncVisionAddresses } from '../../lib/vision-gis-sync'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/** Background Vision GIS crawl. Always runs — catch-up queue ≠ done. */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    if (await isScheduledSyncJobPausedFresh('vision-addresses')) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'vision-addresses scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await syncVisionAddresses()
    return new Response(JSON.stringify(result), {
      status: result.ok === false ? 502 : 200,
      headers: { 'content-type': 'application/json' },
    })
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
