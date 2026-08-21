import 'server-only'

import { syncCronSecret } from '@/lib/netlify-cron-auth'
import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'
import { railwayEndpointForJob } from '@/lib/sync-schedule-config-shared'

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

export type MlsSyncServiceRunBody = {
  startedAt?: string
  source?: 'admin' | 'railway' | 'watchdog'
  towns?: string[]
  statusScope?: 'all' | 'active' | 'closed'
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
 * Ask the Railway mls-sync service to start an Incremental pull (202 Accepted).
 * The service process stays alive and runs RETS→Neon; Netlify does not pull.
 */
export async function queueMlsSyncServiceRun(
  body: MlsSyncServiceRunBody = {},
): Promise<NetlifyFunctionQueueResult> {
  return postToMlsSyncService('/run', {
    startedAt: body.startedAt ?? new Date().toISOString(),
    source: body.source ?? 'admin',
    ...(body.towns?.length ? { towns: body.towns } : {}),
    ...(body.statusScope && body.statusScope !== 'all'
      ? { statusScope: body.statusScope }
      : {}),
  })
}

/**
 * Ask Railway to rebuild stats_cache. Used when Configure names Railway as the
 * stats-cache scheduler; the always-on process can outlast a serverless slot,
 * which a full rebuild needs.
 */
export async function queueMlsSyncServiceStatsRebuild(
  body: { startedAt?: string } = {},
): Promise<NetlifyFunctionQueueResult> {
  return postToMlsSyncService('/stats', {
    startedAt: body.startedAt ?? new Date().toISOString(),
  })
}

/**
 * Start whichever job Configure has pointed at Railway. Routes from the
 * declared endpoint map rather than assuming Incremental, and fails loudly when
 * a job is set to Railway that the service does not host.
 */
export async function queueMlsSyncServiceJob(
  jobId: string,
  body: MlsSyncServiceRunBody = {},
): Promise<NetlifyFunctionQueueResult> {
  const endpoint = railwayEndpointForJob(jobId)
  if (!endpoint) {
    return {
      ok: false,
      status: null,
      base: mlsSyncServiceBaseUrl(),
      error: `Railway mls-sync does not host "${jobId}" — pick another scheduler in Configure`,
    }
  }
  if (endpoint === '/stats') {
    return queueMlsSyncServiceStatsRebuild({ startedAt: body.startedAt })
  }
  if (endpoint === '/scores') {
    return postToMlsSyncService('/scores', {
      startedAt: body.startedAt ?? new Date().toISOString(),
    })
  }
  return queueMlsSyncServiceRun(body)
}
