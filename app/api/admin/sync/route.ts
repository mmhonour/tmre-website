import { NextRequest, NextResponse } from 'next/server'
import {
  isAdminSyncActionId,
  isAdminSyncAllActionId,
  readAdminSyncPanelStatus,
  runAdminSyncAction,
  runAdminSyncAllCaches,
} from '@/lib/admin-sync-actions'
import { buildAdminSyncNextRuns, buildAdminSyncScheduleHints } from '@/lib/admin-sync-schedule'
import { ensurePostDeployFullResyncScheduled } from '@/lib/deploy-full-resync-schedule'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  describeListingsDbRuntime,
  getListingsDbStats,
  getSyncMeta,
  readLatestListingModificationTimestamp,
  resetListingsDbConnections,
} from '@/lib/listings-db'
import { ensureListingsDbHydrated } from '@/lib/listings-db-persist'
import { readSqliteRefreshStatus } from '@/lib/sqlite-refresh-status'
import { probeRetsConnection, readStoredRetsHealth } from '@/lib/rets-health'
import { readRecentSyncFailures } from '@/lib/listings-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureListingsDbHydrated(resetListingsDbConnections)
  await ensurePostDeployFullResyncScheduled()

  const { stats, refresh, nextRuns, scheduleHints } = readAdminSyncPanelStatus()
  const lastRefreshFinished = getSyncMeta('last_refresh_finished_at')
  const lastRefreshStarted = getSyncMeta('last_refresh_started_at')

  let rets = readStoredRetsHealth()
  try {
    rets = await probeRetsConnection()
  } catch (err) {
    console.warn('[/api/admin/sync] RETS probe failed', err)
  }

  return NextResponse.json({
    refreshing: refresh.refreshing,
    lastRefreshFinished: lastRefreshFinished ?? refresh.lastFinishedAt,
    lastRefreshStarted,
    latestListingUpdate: readLatestListingModificationTimestamp(),
    propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
    stats,
    nextRuns,
    scheduleHints,
    rets,
    syncFailures: readRecentSyncFailures(8),
    listingsDbRuntime: describeListingsDbRuntime(),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let action = ''
  let town: string | undefined
  let finalize = false
  try {
    const body = (await req.json()) as { action?: string; town?: string; finalize?: boolean }
    action = body.action?.trim() ?? ''
    town = body.town?.trim()
    finalize = body.finalize === true
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!isAdminSyncActionId(action) && !isAdminSyncAllActionId(action)) {
    return NextResponse.json({ error: 'Unknown sync action' }, { status: 400 })
  }

  await ensureListingsDbHydrated(resetListingsDbConnections)
  await ensurePostDeployFullResyncScheduled()

  const refresh = readSqliteRefreshStatus()
  const chunkedFullResync =
    action === 'full-resync' && (Boolean(town) || finalize)
  if (
    refresh.refreshing &&
    action !== 'publish-snapshot' &&
    action !== 'sync-all-caches' &&
    !chunkedFullResync
  ) {
    return NextResponse.json(
      { error: 'A database refresh is already in progress' },
      { status: 409 },
    )
  }

  try {
    const result =
      action === 'sync-all-caches'
        ? await runAdminSyncAllCaches()
        : await runAdminSyncAction(action, { town, finalize })
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
    const scheduleHints = buildAdminSyncScheduleHints()
    return NextResponse.json({
      ...result,
      stats,
      nextRuns,
      scheduleHints,
      latestListingUpdate: readLatestListingModificationTimestamp(),
      propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
      refreshing: readSqliteRefreshStatus().refreshing,
      lastRefreshFinished: getSyncMeta('last_refresh_finished_at'),
      lastRefreshStarted: getSyncMeta('last_refresh_started_at'),
      rets: await probeRetsConnection(true),
      syncFailures: readRecentSyncFailures(8),
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
