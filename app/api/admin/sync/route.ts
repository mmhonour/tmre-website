import { NextRequest, NextResponse } from 'next/server'
import {
  isAdminSyncActionId,
  isAdminSyncAllActionId,
  readAdminSyncPanelStatus,
  runAdminSyncAction,
  runAdminSyncAllCaches,
} from '@/lib/admin-sync-actions'
import { buildAdminSyncNextRuns } from '@/lib/admin-sync-schedule'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getListingsDbStats,
  getSyncMeta,
  readLatestListingModificationTimestamp,
} from '@/lib/listings-db'
import { readSqliteRefreshStatus } from '@/lib/sqlite-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { stats, refresh, nextRuns } = readAdminSyncPanelStatus()
  const lastRefreshFinished = getSyncMeta('last_refresh_finished_at')
  const lastRefreshStarted = getSyncMeta('last_refresh_started_at')

  return NextResponse.json({
    refreshing: refresh.refreshing,
    lastRefreshFinished: lastRefreshFinished ?? refresh.lastFinishedAt,
    lastRefreshStarted,
    latestListingUpdate: readLatestListingModificationTimestamp(),
    propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
    stats,
    nextRuns,
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let action = ''
  try {
    const body = (await req.json()) as { action?: string }
    action = body.action?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!isAdminSyncActionId(action) && !isAdminSyncAllActionId(action)) {
    return NextResponse.json({ error: 'Unknown sync action' }, { status: 400 })
  }

  const refresh = readSqliteRefreshStatus()
  if (refresh.refreshing && action !== 'publish-snapshot' && action !== 'sync-all-caches') {
    return NextResponse.json(
      { error: 'A database refresh is already in progress' },
      { status: 409 },
    )
  }

  try {
    const result =
      action === 'sync-all-caches'
        ? await runAdminSyncAllCaches()
        : await runAdminSyncAction(action)
    const stats = getListingsDbStats()
    const nextRuns = buildAdminSyncNextRuns({
      lastFullSyncStarted: stats.lastFullSyncStarted,
      lastFullSync: stats.lastFullSync,
      lastIncrementalSyncStarted: stats.lastIncrementalSyncStarted,
      lastIncrementalSync: stats.lastIncrementalSync,
      lastListingScoresStarted: stats.lastListingScoresStarted,
      lastListingScores: stats.lastListingScores,
      lastRefreshStarted: getSyncMeta('last_refresh_started_at'),
      lastRefreshFinished: getSyncMeta('last_refresh_finished_at'),
      lastStatsCacheStarted: stats.lastStatsCacheStarted,
      lastStatsCache: stats.lastStatsCache,
      lastDealOfTheDayCacheStarted: stats.lastDealOfTheDayCacheStarted,
      lastDealOfTheDayCache: stats.lastDealOfTheDayCache,
    })
    return NextResponse.json({
      ...result,
      stats,
      nextRuns,
      latestListingUpdate: readLatestListingModificationTimestamp(),
      propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
      refreshing: readSqliteRefreshStatus().refreshing,
      lastRefreshFinished: getSyncMeta('last_refresh_finished_at'),
      lastRefreshStarted: getSyncMeta('last_refresh_started_at'),
    })
  } catch (err) {
    console.error('[/api/admin/sync]', action, err)
    return NextResponse.json(
      {
        ok: false,
        action,
        error: 'Sync failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }
}
