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
 * POST — run the fuller incremental path in this Admin request (reliable),
 * and also try to queue the background worker when a site URL is available.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const heartbeat = await stampIncrementalCronHeartbeat(startedAt)

  const { runIncrementalSyncListingsWork } = await import(
    '@/lib/netlify-sync-listings-work'
  )
  const result = await runIncrementalSyncListingsWork(startedAt)

  const base = netlifySiteBaseUrl()
  let workerStatus: number | null = null
  if (base) {
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
      workerStatus = res.status
    } catch {
      /* in-process result is authoritative */
    }
  }

  return NextResponse.json({
    ok: result.status < 400,
    mode: 'in-process',
    heartbeat,
    worker: result.body,
    workerStatus,
    note: 'Ran incremental work in this Admin request; scheduled cron queues the background worker (lean in-process only if queue fails)',
  })
}
