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
  /** Once the send owns recording, a second audit row here would double-report. */
  let sendStarted = false

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
    // Stamp the week after a real send so the */30 thin cron cannot re-fire
    // all day. Bug: cron used to pass stampWeek:false explicitly, which skipped
    // markMarketDigestSent and produced ~12 digests on the scheduled weekday.
    // Admin "Send test" sets stampWeek:false; Admin Syncs Run stamps.
    const stampWeek =
      typeof body.stampWeek === 'boolean' ? body.stampWeek : !force

    // Stamping and the History row belong to sendMarketDigestEmail, so this
    // worker and the Railway lane report a send the same way.
    sendStarted = true
    const result = await sendMarketDigestEmail({
      force,
      stampWeek,
      startedAt,
      trigger: fromAdmin ? 'netlify-admin' : 'netlify-worker',
    })

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[netlify/market-digest-worker]', err)
    const finishedAt = new Date().toISOString()
    const detail = err instanceof Error ? err.message : String(err)
    // Failures inside the send already recorded themselves; this covers the ones
    // before it — a Neon hydrate that never came back, a malformed body.
    if (!sendStarted) {
      await recordDashboardSyncAudit({
        startedAt,
        finishedAt,
        syncSuffix: 'digest',
        listingsCount: 0,
        ok: false,
        detail: `Market brief failed before send — ${detail}`,
      }).catch(() => {})
    }
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
