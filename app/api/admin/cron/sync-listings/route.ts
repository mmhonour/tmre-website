import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  netlifySiteBaseUrl,
  syncCronSecret,
} from '@/lib/netlify-cron-auth'
import { LAST_INCREMENTAL_CRON_TICK_KEY } from '@/lib/netlify-sync-listings-work'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import { isServerlessRuntime } from '@/lib/runtime-host'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET — last cron heartbeat stamp (does not invoke Netlify). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await hydrateSyncMetaStore()
  const lastIncrementalCronTick = await getSyncMetaFresh(
    LAST_INCREMENTAL_CRON_TICK_KEY,
  )
  return NextResponse.json({
    lastIncrementalCronTick,
    hasSyncCronSecret: Boolean(syncCronSecret()),
    siteBaseUrl: netlifySiteBaseUrl(),
  })
}

/**
 * POST — queue the incremental background worker (do not await RETS here).
 * Awaiting the full job in this Admin route caused production HTML 504s.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()

  if (isServerlessRuntime()) {
    const { queueNetlifyIncrementalSync } = await import(
      '@/lib/netlify-sync-trigger'
    )
    const queued = await queueNetlifyIncrementalSync(startedAt, {
      source: 'cron',
    })
    return NextResponse.json({
      ok: queued.ok,
      mode: 'background-queued',
      backgroundQueued: queued.ok,
      startedAt,
      workerStatus: queued.status,
      base: queued.base,
      error: queued.ok ? undefined : queued.error,
      note: queued.ok
        ? 'Queued sync-listings-worker (full RETS + digests). Heartbeat stamps when the worker runs.'
        : 'Queue failed — check SYNC_CRON_SECRET / site URL / Netlify function logs.',
    })
  }

  const { runIncrementalSyncListingsWork } = await import(
    '@/lib/netlify-sync-listings-work'
  )
  const result = await runIncrementalSyncListingsWork(startedAt, {
    source: 'cron',
  })

  return NextResponse.json({
    ok: result.status < 400,
    mode: 'in-process',
    worker: result.body,
    note: 'Local/dev: ran incremental work in this request.',
  })
}
