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
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta } from '@/lib/db/sync-meta-store'
import { readSyncNextOverrides } from '@/lib/sync-next-override'
import { ensureAdminListingPhotosReady } from '@/lib/listing-photos-db-persist'
import { readListingsRefreshStatus } from '@/lib/listings-refresh-status'
import { probeRetsConnection, readStoredRetsHealth } from '@/lib/rets-health'
import {
  readLatestListingModificationTimestamp,
  readListingsDbStats,
  readRecentSyncFailures,
} from '@/lib/db/listings-repo'
import { collectAdminDatabaseSyncStats } from '@/lib/sqlite-sync-stats'
import { readSyncQueueSnapshot } from '@/lib/sync-queue'
import { readIncrementalPartialRun } from '@/lib/incremental-partial-run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminListingPhotosReady()
  await ensurePostDeployFullResyncScheduled()

  const {
    stats,
    refresh,
    nextRuns,
    scheduleHints,
    scheduleConfig,
    nextOverrides,
    lastIncrementalCronTick,
    lastEventbridgeIngressAt,
    lastEventbridgeIngressResult,
    lastMlsSyncHeartbeat,
    incrementalLive,
    incrementalLiveStatus,
    incrementalStepLog,
    incrementalStepLogText,
    latestFeedGeneratedAt,
    latestFeedNewestMls,
    latestFeedRowCount,
    lastIncrementalUpserts,
    lastIncrementalUpsertsLabel,
    incrementalUpsertHistory,
    visionAddressesLive,
    visionAddressesLiveStatus,
    statsCacheLastRunStatus,
    statsCacheQueueStatus,
    statsCacheLastRunError,
  } = await readAdminSyncPanelStatus()
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
    lastIncrementalCronTick,
    lastEventbridgeIngressAt,
    lastEventbridgeIngressResult,
    lastMlsSyncHeartbeat,
    propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
    visionAddressesSyncedAt: getSyncMeta('vision_addresses_synced_at'),
    visionAddressesLive,
    visionAddressesLiveStatus,
    zipBoundariesSyncedAt: getSyncMeta('last_zip_boundaries_sync'),
    zipBoundariesSyncStartedAt: getSyncMeta('last_zip_boundaries_sync_started'),
    fomcLastSyncedAt: getSyncMeta('fomc_last_synced_at'),
    cpiLastSyncedAt: getSyncMeta('cpi_last_synced_at'),
    marketDigestLastSentAt: getSyncMeta('market_digest_last_sent_at'),
    stats,
    nextRuns,
    nextOverrides,
    scheduleHints,
    scheduleConfig,
    incrementalLive,
    incrementalLiveStatus,
    incrementalStepLog,
    incrementalStepLogText,
    latestFeedGeneratedAt,
    latestFeedNewestMls,
    latestFeedRowCount,
    lastIncrementalUpserts,
    lastIncrementalUpsertsLabel,
    incrementalUpsertHistory,
    statsCacheLastRunStatus,
    statsCacheQueueStatus,
    statsCacheLastRunError,
    rets,
    incrementalPartial: await readIncrementalPartialRun(),
    syncQueue: await readSyncQueueSnapshot(),
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
  let towns: string[] | undefined
  let statusScope: 'all' | 'active' | 'closed' | undefined
  let finalize = false
  let finalizeStep: string | undefined
  let reset = false
  try {
    const body = (await req.json()) as {
      action?: string
      town?: string
      towns?: string[]
      statusScope?: string
      finalize?: boolean
      finalizeStep?: string
      reset?: boolean
    }
    action = body.action?.trim() ?? ''
    reset = body.reset === true
    town = body.town?.trim()
    if (Array.isArray(body.towns)) {
      towns = body.towns
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
      if (towns.length === 0) towns = undefined
    }
    if (
      body.statusScope === 'all' ||
      body.statusScope === 'active' ||
      body.statusScope === 'closed'
    ) {
      statusScope = body.statusScope
    }
    finalize = body.finalize === true
    finalizeStep = body.finalizeStep?.trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!isAdminSyncActionId(action) && !isAdminSyncAllActionId(action)) {
    return NextResponse.json({ error: 'Unknown sync action' }, { status: 400 })
  }

  if (reset) {
    if (!isAdminSyncActionId(action)) {
      return NextResponse.json(
        { error: 'Clear is per job — pick a row' },
        { status: 400 },
      )
    }
    const { resetAdminSyncJobState } = await import('@/lib/admin-sync-reset')
    const result = await resetAdminSyncJobState(action)
    return NextResponse.json({
      ok: true,
      reset: true,
      action,
      cleared: result.cleared,
      releasedRefreshLock: result.releasedRefreshLock,
      message: 'Dashboard row cleared — clocks and locks only',
    })
  }

  await ensureAdminListingPhotosReady()
  await ensurePostDeployFullResyncScheduled()

  const refresh = readListingsRefreshStatus()
  const chunkedFullResync =
    action === 'full-resync' && (Boolean(town) || finalize || Boolean(finalizeStep))
  // Stats-cache Sync Now only queues a worker (own lock). Incremental holding
  // the global refresh flag must not block the operator from queuing a rebuild.
  if (
    refresh.refreshing &&
    action !== 'publish-snapshot' &&
    action !== 'sync-all-caches' &&
    action !== 'stats-cache' &&
    !chunkedFullResync
  ) {
    const holder = refresh.refreshingKind?.trim() || 'unknown'
    return NextResponse.json(
      {
        error: `A database refresh is already in progress (${holder})`,
      },
      { status: 409 },
    )
  }

  try {
    const result =
      action === 'sync-all-caches'
        ? await runAdminSyncAllCaches()
        : await runAdminSyncAction(action, {
            town,
            towns,
            statusScope,
            finalize,
            finalizeStep,
          })
    const stats = await readListingsDbStats()
    const { readSyncScheduleConfig } = await import('@/lib/sync-schedule-config')
    const scheduleConfig = readSyncScheduleConfig()
    const nextRuns = buildAdminSyncNextRuns(
      {
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
      },
      new Date(),
      scheduleConfig,
    )
    const scheduleHints = buildAdminSyncScheduleHints()
    const nextOverrides = readSyncNextOverrides()
    return NextResponse.json({
      ...result,
      stats,
      nextRuns,
      nextOverrides,
      scheduleHints,
      scheduleConfig,
      latestListingUpdate: await readLatestListingModificationTimestamp(),
      lastMlsSyncHeartbeat: await getSyncMetaFresh('last_mls_sync_heartbeat'),
      propertyAddressesSyncedAt: getSyncMeta('property_addresses_synced_at'),
      visionAddressesSyncedAt: getSyncMeta('vision_addresses_synced_at'),
      ...(await (async () => {
        const {
          readVisionAddressesLiveProgress,
          formatVisionAddressesLiveProgress,
        } = await import('@/lib/vision-gis-sync')
        const visionAddressesLive = readVisionAddressesLiveProgress()
        return {
          visionAddressesLive,
          visionAddressesLiveStatus:
            formatVisionAddressesLiveProgress(visionAddressesLive),
        }
      })()),
      zipBoundariesSyncedAt: getSyncMeta('last_zip_boundaries_sync'),
      zipBoundariesSyncStartedAt: getSyncMeta('last_zip_boundaries_sync_started'),
      fomcLastSyncedAt: getSyncMeta('fomc_last_synced_at'),
      cpiLastSyncedAt: getSyncMeta('cpi_last_synced_at'),
      marketDigestLastSentAt: getSyncMeta('market_digest_last_sent_at'),
      refreshing: readListingsRefreshStatus().refreshing,
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
