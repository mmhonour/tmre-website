import type { Config } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { dispatchEventBridgeScheduledJob } from '../../lib/eventbridge-sync-dispatch'

/**
 * AWS EventBridge Scheduler target (HTTP).
 *
 * POST JSON: { "job": "incremental" }  (ScheduledSyncJobId)
 * Auth: Authorization: Bearer $SYNC_CRON_SECRET  (or ?secret=)
 *
 * Configure radio must be EventBridge for that job or this no-ops (200 skip).
 */
export default async function handler(req: Request) {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST required' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!assertSyncCronAuth(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: { job?: unknown } = {}
  try {
    body = (await req.json()) as { job?: unknown }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await hydrateSyncMetaStore()
    const result = await dispatchEventBridgeScheduledJob(body.job)
    const status = result.ok || result.skipped ? 200 : 502
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[eventbridge-sync-ingress]', err)
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

/** No schedule — EventBridge HTTP target only. */
export const config: Config = {}
