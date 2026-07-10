import 'server-only'

import { rebuildDealOfTheDayCache } from '@/lib/deal-of-the-day-cache'
import { rebuildAllListingScores } from '@/lib/listing-scores-rebuild'
import { getListingsDbStats, getSyncMeta, publishListingsReadSnapshot, setSyncMeta } from '@/lib/listings-db'
import { syncAllTownListings, syncIncrementalListings } from '@/lib/listings-sync'
import { rebuildStatsCache } from '@/lib/stats-cache'
import { readSqliteRefreshStatus } from '@/lib/sqlite-refresh-status'
import { buildAdminSyncNextRuns } from '@/lib/admin-sync-schedule'
import type { AdminSyncActionId, AdminSyncAllActionId } from '@/lib/admin-sync-types'
import { ADMIN_SYNC_ACTIONS, ADMIN_SYNC_ALL_SEQUENCE } from '@/lib/admin-sync-types'

export type { AdminSyncActionId } from '@/lib/admin-sync-types'
export {
  ADMIN_SYNC_ACTIONS,
  ADMIN_SYNC_ALL_SEQUENCE,
  isAdminSyncActionId,
  isAdminSyncAllActionId,
} from '@/lib/admin-sync-types'

export type AdminSyncActionResult = {
  ok: boolean
  action: AdminSyncActionId
  startedAt: string
  finishedAt: string
  durationMs: number
  message: string
  detail?: string
  /** Human label when this step is not a primary panel action (sync-all extras). */
  stepLabel?: string
}

export async function runAdminSyncAction(action: AdminSyncActionId): Promise<AdminSyncActionResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  switch (action) {
    case 'full-resync': {
      const result = await syncAllTownListings()
      const ok = result.towns.length === 0 || result.towns.every((row) => row.ok)
      const failed = result.towns.filter((row) => !row.ok)
      const finishedAt = result.finishedAt ?? new Date().toISOString()
      return {
        ok,
        action,
        startedAt: result.startedAt ?? startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: ok
          ? `Full resync complete — ${result.totalUpserted.toLocaleString()} listings`
          : `Full resync finished with ${failed.length} town failure(s)`,
        detail: failed.length
          ? failed.map((row) => `${row.town} ${row.statusBucket}: ${row.error ?? 'failed'}`).join('; ')
          : undefined,
      }
    }
    case 'incremental': {
      const result = await syncIncrementalListings()
      const ok = result.towns.every((row) => row.ok)
      const failed = result.towns.filter((row) => !row.ok)
      const finishedAt = result.finishedAt ?? new Date().toISOString()
      return {
        ok,
        action,
        startedAt: result.startedAt ?? startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: ok
          ? `Incremental sync complete — ${result.totalUpserted.toLocaleString()} upserts`
          : `Incremental sync finished with ${failed.length} failure(s)`,
        detail: failed.length
          ? failed.map((row) => `${row.town}: ${row.error ?? 'failed'}`).join('; ')
          : undefined,
      }
    }
    case 'listing-scores': {
      const result = await rebuildAllListingScores()
      const ok = result.towns.every((row) => row.ok)
      const finishedAt = result.finishedAt ?? new Date().toISOString()
      return {
        ok,
        action,
        startedAt: result.startedAt ?? startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: `Scored ${result.totalScored.toLocaleString()} Active listings`,
        detail: result.towns
          .filter((row) => !row.ok)
          .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
          .join('; ') || undefined,
      }
    }
    case 'publish-snapshot': {
      setSyncMeta('last_refresh_started_at', startedAt)
      publishListingsReadSnapshot()
      const finishedAt = new Date().toISOString()
      setSyncMeta('last_refresh_finished_at', finishedAt)
      return {
        ok: true,
        action,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        message: 'Read snapshot published',
      }
    }
    case 'stats-cache': {
      const result = rebuildStatsCache({ trackRefresh: true })
      const finishedAt = new Date().toISOString()
      return {
        ok: true,
        action,
        startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: `Stats cache rebuilt — ${result.written.toLocaleString()} entries`,
      }
    }
    case 'deal-of-the-day': {
      const result = await rebuildDealOfTheDayCache()
      const finishedAt = new Date().toISOString()
      return {
        ok: true,
        action,
        startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: `Deal of the Day cache rebuilt — ${result.written.toLocaleString()} entries`,
      }
    }
    case 'property-addresses': {
      const { syncPropertyAddresses } = await import('@/lib/property-address-sync')
      const result = await syncPropertyAddresses()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt: result.syncedAt,
        durationMs: result.durationMs || Date.now() - t0,
        message: `${result.totalRows.toLocaleString()} addresses (${result.mlsRows.toLocaleString()} MLS, ${result.assessorRows.toLocaleString()} assessor)`,
      }
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export type AdminSyncAllResult = {
  ok: boolean
  action: AdminSyncAllActionId
  startedAt: string
  finishedAt: string
  durationMs: number
  message: string
  detail?: string
  steps: AdminSyncActionResult[]
}

/** Run every admin cache action in order (stops on first failure). */
export async function runAdminSyncAllCaches(): Promise<AdminSyncAllResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const steps: AdminSyncActionResult[] = []

  for (const actionId of ADMIN_SYNC_ALL_SEQUENCE) {
    const step = await runAdminSyncAction(actionId)
    steps.push(step)
    if (!step.ok) {
      const label = ADMIN_SYNC_ACTIONS[actionId].label
      return {
        ok: false,
        action: 'sync-all-caches',
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        message: `Sync all stopped at ${label}`,
        detail: step.detail ?? step.message,
        steps,
      }
    }
  }

  const extraSteps = await runAdminSyncAllExtraCaches()
  steps.push(...extraSteps)
  const failedExtra = extraSteps.find((step) => !step.ok)
  if (failedExtra) {
    return {
      ok: false,
      action: 'sync-all-caches',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      message: `Sync all stopped at ${failedExtra.stepLabel ?? 'extended cache step'}`,
      detail: failedExtra.detail ?? failedExtra.message,
      steps,
    }
  }

  const snapshot = await runAdminSyncAction('publish-snapshot')
  steps.push(snapshot)
  if (!snapshot.ok) {
    return {
      ok: false,
      action: 'sync-all-caches',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      message: 'Sync all stopped at publish read snapshot',
      detail: snapshot.detail ?? snapshot.message,
      steps,
    }
  }

  const finishedAt = new Date().toISOString()
  return {
    ok: true,
    action: 'sync-all-caches',
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    message: `All caches synced — ${steps.length} steps in ${Math.round((Date.now() - t0) / 1000)}s`,
    steps,
  }
}

async function runAdminSyncAllExtraCaches(): Promise<AdminSyncActionResult[]> {
  const steps: AdminSyncActionResult[] = []

  const runStep = async (
    stepLabel: string,
    fn: () => Promise<{ message: string; detail?: string }>,
  ) => {
    const stepStartedAt = new Date().toISOString()
    const t0 = Date.now()
    try {
      const result = await fn()
      steps.push({
        ok: true,
        action: 'stats-cache',
        stepLabel,
        startedAt: stepStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        message: result.message,
        detail: result.detail,
      })
    } catch (err) {
      steps.push({
        ok: false,
        action: 'stats-cache',
        stepLabel,
        startedAt: stepStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        message: 'Failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await runStep('Intelligence deal board', async () => {
    const { rebuildIntelligenceDealBoardCache } = await import(
      '@/lib/intelligence-deal-board-cache'
    )
    const board = await rebuildIntelligenceDealBoardCache()
    return {
      message: `${board.listings.toLocaleString()} listings across ${board.towns} towns`,
    }
  })

  await runStep('Latest town feeds', async () => {
    const { rebuildLatestTownFeedCaches } = await import('@/lib/latest-town-feed-cache')
    const feeds = await rebuildLatestTownFeedCaches()
    return {
      message: `${feeds.listings.toLocaleString()} listings across ${feeds.towns} towns`,
    }
  })

  await runStep('Property address directory', async () => {
    const { syncPropertyAddresses } = await import('@/lib/property-address-sync')
    const addresses = await syncPropertyAddresses()
    return {
      message: `${addresses.totalRows.toLocaleString()} rows (${addresses.mlsRows.toLocaleString()} MLS, ${addresses.assessorRows.toLocaleString()} assessor)`,
    }
  })

  await runStep('Deal of the Week cache', async () => {
    const { rebuildDealOfTheWeekCache } = await import('@/lib/deal-of-the-week-cache')
    const ok = await rebuildDealOfTheWeekCache()
    return {
      message: ok ? 'Deal of the Week rebuilt' : 'No qualifying Deal of the Week listing',
    }
  })

  return steps
}

export function readAdminSyncPanelStatus() {
  const stats = getListingsDbStats()
  const refresh = readSqliteRefreshStatus()
  const lastRefreshFinished = getSyncMeta('last_refresh_finished_at')
  const lastRefreshStarted = getSyncMeta('last_refresh_started_at')
  const nextRuns = buildAdminSyncNextRuns({
    lastFullSyncStarted: stats.lastFullSyncStarted,
    lastFullSync: stats.lastFullSync,
    lastIncrementalSyncStarted: stats.lastIncrementalSyncStarted,
    lastIncrementalSync: stats.lastIncrementalSync,
    lastListingScoresStarted: stats.lastListingScoresStarted,
    lastListingScores: stats.lastListingScores,
    lastRefreshStarted,
    lastRefreshFinished: lastRefreshFinished ?? refresh.lastFinishedAt,
    lastStatsCacheStarted: stats.lastStatsCacheStarted,
    lastStatsCache: stats.lastStatsCache,
    lastDealOfTheDayCacheStarted: stats.lastDealOfTheDayCacheStarted,
    lastDealOfTheDayCache: stats.lastDealOfTheDayCache,
  })
  return { stats, refresh, nextRuns }
}
