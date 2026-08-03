import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { recordDashboardSyncAudit } from '../../lib/db/listings-repo'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { sendMarketDigestEmail } from '../../lib/market-digest-notify'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Background Monday market brief email.
 * Invoked by thin `market-digest` schedule or Admin Syncs Run — not scheduled itself.
 */
export default async function handler(req: Request, _context: Context) {
  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  process.env.NETLIFY_SYNC_HANDLER = '1'
  const startedAt = new Date().toISOString()

  try {
    await hydrateSyncMetaStore()
    const body = (await req.json().catch(() => ({}))) as {
      source?: string
      force?: boolean
      stampWeek?: boolean
    }
    const fromAdmin = body.source === 'admin'

    if (!fromAdmin && (await isScheduledSyncJobPausedFresh('market-digest'))) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'market-digest scheduled sync paused by admin',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const force = fromAdmin || body.force === true
    const stampWeek = fromAdmin
      ? body.stampWeek !== false
      : body.stampWeek === true

    const result = await sendMarketDigestEmail({
      force,
      stampWeek: fromAdmin ? stampWeek : undefined,
    })
    const finishedAt = new Date().toISOString()

    // Cron "already sent / disabled" skips stay quiet; admin runs always audit.
    if (fromAdmin || !result.skipped) {
      await recordDashboardSyncAudit({
        startedAt,
        finishedAt,
        syncSuffix: 'digest',
        listingsCount: 0,
        ok: result.ok && !result.skipped,
        detail: result.skipped
          ? result.reason ?? 'Market brief skipped'
          : result.ok
            ? `Market brief sent to ${result.to ?? 'recipient'}${
                result.subject ? ` — ${result.subject}` : ''
              }`
            : result.reason ?? 'Market brief send failed',
      })
    }

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/market-digest-worker]', err)
    const finishedAt = new Date().toISOString()
    const detail = err instanceof Error ? err.message : String(err)
    await recordDashboardSyncAudit({
      startedAt,
      finishedAt,
      syncSuffix: 'digest',
      listingsCount: 0,
      ok: false,
      detail,
    }).catch(() => {})
    return new Response(
      JSON.stringify({
        error: detail,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  background: true,
}
