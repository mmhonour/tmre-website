import 'server-only'

import { syncCronSecret } from '@/lib/netlify-cron-auth'
import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'
import { isSyncQueueRunnerJob } from '@/lib/sync-queue-shared'

/**
 * Railway (or local) mls-sync base URL — no trailing slash.
 * Accepts host-only values (common Railway copy/paste) and adds https://.
 */
export function mlsSyncServiceBaseUrl(): string | null {
  const raw = process.env.MLS_SYNC_SERVICE_URL?.trim()
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const path = u.pathname.replace(/\/$/, '')
    return path && path !== '/' ? `${u.origin}${path}` : u.origin
  } catch {
    return null
  }
}

async function postToMlsSyncService(
  path: string,
  payload: Record<string, unknown>,
): Promise<NetlifyFunctionQueueResult> {
  const rawConfigured = process.env.MLS_SYNC_SERVICE_URL?.trim() || null
  const base = mlsSyncServiceBaseUrl()
  if (!base) {
    return {
      ok: false,
      status: null,
      base: null,
      error: rawConfigured
        ? `MLS_SYNC_SERVICE_URL is invalid (got "${rawConfigured.slice(0, 80)}"; need https://… host)`
        : 'MLS_SYNC_SERVICE_URL is not set (Railway mls-sync public URL)',
    }
  }

  const secret = syncCronSecret()
  if (!secret) {
    return {
      ok: false,
      status: null,
      base,
      error: 'SYNC_CRON_SECRET is not set',
    }
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
    const status = res.status
    // 202 = accepted; 200 = finished synchronously (dev); 409 = already running (ok)
    if (status === 202 || status === 200 || status === 409) {
      return { ok: true, status, base }
    }
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      status,
      base,
      error: text.slice(0, 300) || `HTTP ${status}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      base,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Nudge the runner to look at the queue now instead of on its next poll.
 *
 * The row in `sync_queue` is what actually starts the job, so this is a latency
 * optimisation and nothing more: if the service is unreachable, the work still
 * happens on the next drain tick. Callers should not treat a failure here as a
 * failure to schedule.
 */
export async function pokeMlsSyncServiceQueue(
  jobId: string,
): Promise<NetlifyFunctionQueueResult> {
  if (!isSyncQueueRunnerJob(jobId)) {
    return {
      ok: false,
      status: null,
      base: mlsSyncServiceBaseUrl(),
      error: `"${jobId}" is not a sync-queue job — the runner never claims it`,
    }
  }
  return postToMlsSyncService('/drain', { jobId })
}
