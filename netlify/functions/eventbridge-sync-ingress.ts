import type { Config } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { dispatchEventBridgeScheduledJob } from '../../lib/eventbridge-sync-dispatch'
import { stampEventBridgeIngressHit } from '../../lib/eventbridge-ingress-stamp'
import { isScheduledSyncJobId } from '../../lib/scheduled-sync-jobs-shared'

/**
 * AWS EventBridge Scheduler target (HTTP).
 *
 * POST JSON: { "job": "incremental" }  (ScheduledSyncJobId)
 * Auth: Authorization: Bearer $SYNC_CRON_SECRET  (or ?secret=)
 *
 * Configure radio must be EventBridge for that job or this no-ops (200 skip).
 * Every hit stamps last_eventbridge_ingress_* for Admin Dashboard visibility.
 */
export default async function handler(req: Request) {
  process.env.NETLIFY_SYNC_HANDLER = '1'

  if (req.method !== 'POST') {
    await hydrateSyncMetaStore().catch(() => {})
    await stampEventBridgeIngressHit({
      jobId: 'unknown',
      outcome: 'method_not_allowed',
      reason: 'POST required',
      httpStatus: 405,
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: 'POST required' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: { job?: unknown } = {}
  let parseFailed = false
  try {
    body = (await req.json()) as { job?: unknown }
  } catch {
    parseFailed = true
  }

  const rawJob = typeof body.job === 'string' ? body.job.trim() : null
  const jobId =
    rawJob && isScheduledSyncJobId(rawJob) ? rawJob : rawJob || 'unknown'

  try {
    await hydrateSyncMetaStore()
  } catch {
    /* stamp best-effort below */
  }

  if (parseFailed) {
    await stampEventBridgeIngressHit({
      jobId,
      outcome: 'bad_request',
      reason: 'invalid JSON',
      httpStatus: 400,
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!assertSyncCronAuth(req)) {
    await stampEventBridgeIngressHit({
      jobId,
      outcome: 'unauthorized',
      reason: 'SYNC_CRON_SECRET mismatch or missing Bearer',
      httpStatus: 401,
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await dispatchEventBridgeScheduledJob(body.job)
    const status = result.ok || result.skipped ? 200 : 502
    const stampJob = result.jobId ?? jobId
    if (result.ok) {
      await stampEventBridgeIngressHit({
        jobId: stampJob,
        outcome: result.queue ? 'queued' : 'ok',
        reason: result.reason,
        httpStatus: status,
      })
    } else if (result.skipped) {
      await stampEventBridgeIngressHit({
        jobId: stampJob,
        outcome: 'skipped',
        reason: result.reason,
        httpStatus: status,
      })
    } else {
      await stampEventBridgeIngressHit({
        jobId: stampJob,
        outcome: 'failed',
        reason: result.reason ?? 'dispatch failed',
        httpStatus: status,
      })
    }
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('[eventbridge-sync-ingress]', err)
    const message = err instanceof Error ? err.message : String(err)
    await stampEventBridgeIngressHit({
      jobId,
      outcome: 'failed',
      reason: message,
      httpStatus: 500,
    }).catch(() => {})
    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

/** No schedule — EventBridge HTTP target only. */
export const config: Config = {}
