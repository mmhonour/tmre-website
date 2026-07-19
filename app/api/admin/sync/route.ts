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
import { getSyncMeta } from '@/lib/db/sync-meta-store'
import { ensureAdminListingPhotosReady } from '@/lib/listing-photos-db-persist'
import { readSqliteRefreshStatus } from '@/lib/sqlite-refresh-status'
import { probeRetsConnection, readStoredRetsHealth } from '@/lib/rets-health'
import {
  readLatestListingModificationTimestamp,
  readListingsDbStats,
  readRecentSyncFailures,
} from '@/lib/db/listings-repo'
import { collectAdminDatabaseSyncStats } from '@/lib/sqlite-sync-stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminListingPhotosReady()
  await ensurePostDeployFullResyncScheduled()

  const { stats, refresh, nextRuns, scheduleHints } = await readAdminSyncPanelStatus()
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
    latestListingUpdate: await readLatestListingModificationTimestamp(),
    propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
    zipBoundariesSyncedAt: getSyncMeta('last_zip_boundaries_sync'),
    zipBoundariesSyncStartedAt: getSyncMeta('last_zip_boundaries_sync_started'),
    stats,
    nextRuns,
    scheduleHints,
    rets,
    syncFailures: await readRecentSyncFailures(8),
    databaseStats: await collectAdminDatabaseSyncStats(),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let action = ''
  let town: string | undefined
  let finalize = false
  let finalizeStep: string | undefined
  try {
    const body = (await req.json()) as {
      action?: string
      town?: string
      finalize?: boolean
      finalizeStep?: string
    }
    action = body.action?.trim() ?? ''
    town = body.town?.trim()
    finalize = body.finalize === true
    finalizeStep = body.finalizeStep?.trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!isAdminSyncActionId(action) && !isAdminSyncAllActionId(action)) {
    return NextResponse.json({ error: 'Unknown sync action' }, { status: 400 })
  }

  await ensureAdminListingPhotosReady()
  await ensurePostDeployFullResyncScheduled()

  const refresh = readSqliteRefreshStatus()
  const chunkedFullResync =
    action === 'full-resync' && (Boolean(town) || finalize || Boolean(finalizeStep))
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
        : await runAdminSyncAction(action, { town, finalize, finalizeStep })
    const stats = await readListingsDbStats()
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
      latestListingUpdate: await readLatestListingModificationTimestamp(),
      propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
      zipBoundariesSyncedAt: getSyncMeta('last_zip_boundaries_sync'),
      zipBoundariesSyncStartedAt: getSyncMeta('last_zip_boundaries_sync_started'),
      refreshing: readSqliteRefreshStatus().refreshing,
      lastRefreshFinished: getSyncMeta('last_refresh_finished_at'),
      lastRefreshStarted: getSyncMeta('last_refresh_started_at'),
      rets: await probeRetsConnection(true),
      syncFailures: await readRecentSyncFailures(8),
      databaseStats: await collectAdminDatabaseSyncStats(),
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
