import type { Config } from '@netlify/functions'
import {
  netlifySiteBaseUrl,
  syncCronSecret,
} from '../../lib/netlify-cron-auth'
import { stampIncrementalCronHeartbeat } from '../../lib/netlify-sync-listings-work'

/**
 * Thin SCHEDULED trigger (no background).
 *
 * Netlify docs: long work must run in a separate background function invoked
 * from a standard scheduled function. Combining `schedule` + `background: true`
 * on one function can deploy with a schedule badge but never auto-invoke.
 *
 * This handler must finish well under the 30s scheduled-function limit:
 * 1) stamp cron heartbeat → sync_runs + last_incremental_cron_tick
 * 2) POST the background worker
 */
export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'
  const startedAt = new Date().toISOString()

  const heartbeat = await stampIncrementalCronHeartbeat(startedAt)

  const base = netlifySiteBaseUrl()
  if (!base) {
    console.error('[netlify/sync-listings] no URL/DEPLOY_* base — cannot queue worker')
    return new Response(
      JSON.stringify({
        ok: false,
        heartbeat,
        error: 'Missing URL/DEPLOY_URL — background worker not queued',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  const secret = syncCronSecret()
  const workerUrl = `${base}/.netlify/functions/sync-listings-worker`
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (secret) headers.authorization = `Bearer ${secret}`

  let workerStatus: number | null = null
  let workerQueued = false
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ startedAt, source: 'scheduled-sync-listings' }),
    })
    workerStatus = res.status
    // Background functions acknowledge with 202; sync also accepts 200.
    workerQueued = res.status === 202 || res.ok
    if (!workerQueued) {
      const text = await res.text().catch(() => '')
      console.error(
        `[netlify/sync-listings] worker invoke failed status=${res.status}`,
        text.slice(0, 400),
      )
    }
  } catch (err) {
    console.error('[netlify/sync-listings] worker invoke error', err)
  }

  return new Response(
    JSON.stringify({
      ok: heartbeat.ok && workerQueued,
      mode: 'scheduler',
      heartbeat,
      workerQueued,
      workerStatus,
      workerUrl,
    }),
    {
      status: heartbeat.ok && workerQueued ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  )
}

export const config: Config = {
  // Literal cron — Netlify schedule detection is unreliable with template literals.
  // Do NOT set background: true here (see file comment).
  schedule: '*/30 * * * *',
}
