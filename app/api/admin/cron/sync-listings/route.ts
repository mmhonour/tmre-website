import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  netlifySiteBaseUrl,
  syncCronSecret,
} from '@/lib/netlify-cron-auth'
import {
  LAST_INCREMENTAL_CRON_TICK_KEY,
  stampIncrementalCronHeartbeat,
} from '@/lib/netlify-sync-listings-work'
import { getSyncMeta } from '@/lib/db/sync-meta-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET — last cron heartbeat stamp (does not invoke Netlify). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    lastIncrementalCronTick: getSyncMeta(LAST_INCREMENTAL_CRON_TICK_KEY),
    hasSyncCronSecret: Boolean(syncCronSecret()),
    siteBaseUrl: netlifySiteBaseUrl(),
  })
}

/**
 * POST — stamp heartbeat + queue Netlify background worker (same path as cron).
 * Use when the scheduled function is silent so Admin can force a tick.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const heartbeat = await stampIncrementalCronHeartbeat(startedAt)

  const base = netlifySiteBaseUrl()
  if (!base) {
    // Fall back to running work in-process on this Lambda (admin-triggered).
    const { runIncrementalSyncListingsWork } = await import(
      '@/lib/netlify-sync-listings-work'
    )
    const result = await runIncrementalSyncListingsWork(startedAt)
    return NextResponse.json({
      ok: result.status < 400,
      mode: 'in-process',
      heartbeat,
      worker: result.body,
      note: 'No URL/DEPLOY_URL — ran incremental work in this Admin request',
    })
  }

  const secret = syncCronSecret()
  const workerUrl = `${base}/.netlify/functions/sync-listings-worker`
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`

  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ startedAt, source: 'admin-cron-sync-listings' }),
    })
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text) as unknown
    } catch {
      /* keep text */
    }
    return NextResponse.json({
      ok: res.status === 202 || res.ok,
      mode: 'queued-worker',
      heartbeat,
      workerStatus: res.status,
      workerUrl,
      workerBody: body,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode: 'queue-failed',
        heartbeat,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }
}
