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
import {
  INCREMENTAL_SYNC_STALE_MS,
  runIncrementalSyncWatchdog,
} from '@/lib/incremental-sync-watchdog'
import { isScheduledSyncJobPausedFresh } from '@/lib/scheduled-sync-toggle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET — cron heartbeat + last successful sync; also runs stale watchdog once. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await hydrateSyncMetaStore()
  const lastIncrementalCronTick = await getSyncMetaFresh(
    LAST_INCREMENTAL_CRON_TICK_KEY,
  )
  const lastIncrementalSync = await getSyncMetaFresh('last_incremental_sync')
  const paused = await isScheduledSyncJobPausedFresh('incremental')

  // Visiting Admin heals a stuck site without a button click.
  let watchdog: Awaited<ReturnType<typeof runIncrementalSyncWatchdog>> | null =
    null
  try {
    watchdog = await runIncrementalSyncWatchdog()
  } catch (err) {
    console.warn('[api/admin/cron/sync-listings] watchdog failed', err)
  }

  const syncAgeMs = lastIncrementalSync
    ? Math.max(0, Date.now() - Date.parse(lastIncrementalSync))
    : null
  const syncStale =
    syncAgeMs == null ||
    Number.isNaN(syncAgeMs) ||
    syncAgeMs > INCREMENTAL_SYNC_STALE_MS

  return NextResponse.json({
    lastIncrementalCronTick,
    lastIncrementalSync,
    syncStale,
    syncAgeMs,
    paused,
    hasSyncCronSecret: Boolean(syncCronSecret()),
    siteBaseUrl: netlifySiteBaseUrl(),
    watchdog,
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
      source: 'admin',
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
        ? 'Queued sync-listings-worker (full RETS + digests). Watch Syncs → Dashboard Start/End.'
        : 'Queue failed — check SYNC_CRON_SECRET / site URL / Netlify function logs.',
    })
  }

  const { runIncrementalSyncListingsWork } = await import(
    '@/lib/netlify-sync-listings-work'
  )
  const result = await runIncrementalSyncListingsWork(startedAt, {
    source: 'admin',
  })

  return NextResponse.json({
    ok: result.status < 400,
    mode: 'in-process',
    worker: result.body,
    note: 'Local/dev: ran incremental work in this request.',
  })
}
