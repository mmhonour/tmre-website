import 'server-only'

import { syncCronSecret } from '@/lib/netlify-cron-auth'
import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'

/** Railway (or local) mls-sync base URL — no trailing slash. */
export function mlsSyncServiceBaseUrl(): string | null {
  const raw = process.env.MLS_SYNC_SERVICE_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export type MlsSyncServiceRunBody = {
  startedAt?: string
  source?: 'admin' | 'railway' | 'watchdog'
  towns?: string[]
  statusScope?: 'all' | 'active' | 'closed'
}

/**
 * Ask the Railway mls-sync service to start an Incremental pull (202 Accepted).
 * The service process stays alive and runs RETS→Neon; Netlify does not pull.
 */
export async function queueMlsSyncServiceRun(
  body: MlsSyncServiceRunBody = {},
): Promise<NetlifyFunctionQueueResult> {
  const base = mlsSyncServiceBaseUrl()
  if (!base) {
    return {
      ok: false,
      status: null,
      base: null,
      error:
        'MLS_SYNC_SERVICE_URL is not set (Railway mls-sync public URL)',
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
    const res = await fetch(`${base}/run`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startedAt: body.startedAt ?? new Date().toISOString(),
        source: body.source ?? 'admin',
        ...(body.towns?.length ? { towns: body.towns } : {}),
        ...(body.statusScope && body.statusScope !== 'all'
          ? { statusScope: body.statusScope }
          : {}),
      }),
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
