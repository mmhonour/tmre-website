import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { runIncrementalSyncListingsWork } from '../../lib/netlify-sync-listings-work'
import { recordSyncRun } from '../../lib/db/listings-repo'

/**
 * Background MLS incremental worker (up to ~15 minutes).
 * - Admin Syncs "Incremental": full RETS + digests (source=admin)
 * - Thin `sync-listings` schedule: queues this for full RETS (source=cron)
 * - Legacy sideWorkOnly: board/stats + digests only
 * Not scheduled itself — pairing schedule+background on one function was silent.
 *
 * Netlify returns 202 to the invoker before this handler runs. Auth failures and
 * early exits must write sync_runs or Admin history stays stuck on the last RETS.
 */
export default async function handler(req: Request, _context: Context) {
  let startedAt = new Date().toISOString()
  let sideWorkOnly = false
  let source: 'admin' | 'cron' | 'netlify-sync-trigger' | 'watchdog' | undefined
  try {
    const body = (await req.json().catch(() => null)) as {
      startedAt?: string
      sideWorkOnly?: boolean
      source?: string
    } | null
    if (body?.startedAt && !Number.isNaN(Date.parse(body.startedAt))) {
      startedAt = body.startedAt
    }
    if (body?.sideWorkOnly === true) sideWorkOnly = true
    if (
      body?.source === 'admin' ||
      body?.source === 'cron' ||
      body?.source === 'netlify-sync-trigger' ||
      body?.source === 'watchdog'
    ) {
      source = body.source
    }
  } catch {
    /* ignore body parse */
  }

  if (!assertSyncCronAuth(req)) {
    try {
      await recordSyncRun({
        startedAt,
        finishedAt: new Date().toISOString(),
        town: '(all)',
        statusBucket: 'Worker/incremental',
        listingsCount: 0,
        ok: false,
        error: `background worker unauthorized (${source ?? 'unknown'}) — SYNC_CRON_SECRET mismatch`,
      })
    } catch {
      /* ignore */
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await recordSyncRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      town: '(all)',
      statusBucket: 'Worker/incremental',
      listingsCount: 0,
      ok: true,
      error: sideWorkOnly
        ? `worker started (${source ?? 'cron'}) — side-work only`
        : `worker started (${source ?? 'cron'}) — running RETS`,
    })
  } catch (err) {
    console.warn('[sync-listings-worker] start audit failed', err)
  }

  const result = await runIncrementalSyncListingsWork(startedAt, {
    sideWorkOnly,
    source,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  background: true,
}
