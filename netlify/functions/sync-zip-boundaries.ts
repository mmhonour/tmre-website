import type { Config } from '@netlify/functions'
import { syncAllTmreZipBoundaries } from '../../lib/zip-boundary-cache'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Monthly Census TIGERweb → Postgres `zip_boundaries` refresh.
 * Cron: 10:00 UTC on the 1st of each month.
 */
export default async function handler() {
  try {
    if (await isScheduledSyncJobPausedFresh('zip-boundaries')) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'zip-boundaries scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const result = await syncAllTmreZipBoundaries()
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/sync-zip-boundaries]', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  schedule: '0 10 1 * *',
  background: true,
}
