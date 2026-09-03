import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { recordDashboardSyncAudit } from '../../lib/db/listings-repo'
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

  const startedAt = new Date().toISOString()
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
    try {
      await recordDashboardSyncAudit({
        startedAt,
        finishedAt: result.syncedAt || new Date().toISOString(),
        syncSuffix: 'vision',
        listingsCount: result.parcelsFetched,
        ok: result.ok !== false,
        detail: [
          `${result.town}: ${result.totalRows.toLocaleString()} vision rows (${result.phase})`,
          result.detail,
        ]
          .filter(Boolean)
          .join(' — '),
      })
    } catch (auditErr) {
      console.warn('[netlify/sync-vision-addresses-worker] audit failed', auditErr)
    }
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
