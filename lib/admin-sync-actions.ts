import 'server-only'

import { rebuildDealOfTheDayCache } from '@/lib/deal-of-the-day-cache'
import { rebuildAllListingScores } from '@/lib/listing-scores-rebuild'
import {
  countWriteDbListings,
  countWriteDbListingsByBucket,
  getListingsDbStats,
  getSyncMeta,
  listingsDbPath,
  publishListingsReadSnapshot,
  resetListingsDbConnections,
  setSyncMeta,
} from '@/lib/listings-db'
import {
  clearChunkedFullResyncProgress,
  ensureListingsDbHydrated,
  prepareListingsDbForChunkedSync,
  readChunkedFullResyncProgress,
  saveChunkedFullResyncProgress,
} from '@/lib/listings-db-persist'
import { syncAllTownListings, syncIncrementalListings, syncFullResyncTown, finalizeChunkedFullResync, type TownSyncResult } from '@/lib/listings-sync'
import { isRetsConfigured, retsSyncBlockedMessage } from '@/lib/rets'
import { isTmreTown, TMRE_TOWNS } from '@/lib/tmre-towns'
import {
  formatFullResyncCompleteDetail,
  formatFullResyncTownProgressWithTables,
  formatTownSyncSummary,
} from '@/lib/admin-sync-progress'
import { rebuildStatsCache } from '@/lib/stats-cache'
import { readSqliteRefreshStatus, healStaleRefreshLock } from '@/lib/sqlite-refresh-status'
import { buildAdminSyncNextRuns, buildAdminSyncScheduleHints } from '@/lib/admin-sync-schedule'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  collectWriteDatabaseTableStats,
  saveAdminSyncTableStats,
} from '@/lib/sqlite-sync-stats'
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
  /** Records/objects written during this step. */
  recordsFetched?: number
  /** Per-town RETS → SQLite results when applicable. */
  townResults?: TownSyncResult[]
  /** True when full resync was handed off to a Netlify background function. */
  backgroundQueued?: boolean
  /** Human label when this step is not a primary panel action (sync-all extras). */
  stepLabel?: string
}

function formatSyncFailures(failed: TownSyncResult[]): string | undefined {
  if (!failed.length) return undefined
  const byError = new Map<string, string[]>()
  for (const row of failed) {
    const err = row.error?.trim() || 'failed'
    const label = `${row.town} ${row.statusBucket}`
    if (!byError.has(err)) byError.set(err, [])
    byError.get(err)!.push(label)
  }
  return [...byError.entries()]
    .map(([err, labels]) =>
      labels.length > 3 ? `${err} (${labels.slice(0, 3).join(', ')}, +${labels.length - 3} more)` : `${err} (${labels.join(', ')})`,
    )
    .join(' · ')
}

export type AdminSyncActionOptions = {
  /** One town step of a chunked full resync. */
  town?: string
  /** Run cache rebuilds after all town steps. */
  finalize?: boolean
}

export async function runAdminSyncAction(
  action: AdminSyncActionId,
  options: AdminSyncActionOptions = {},
): Promise<AdminSyncActionResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  healStaleRefreshLock()

  switch (action) {
    case 'full-resync': {
      if (!isRetsConfigured()) {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Full resync skipped — RETS not configured on this host',
          detail: retsSyncBlockedMessage(),
        }
      }
      if (options.finalize) {
        await prepareListingsDbForChunkedSync(listingsDbPath(), resetListingsDbConnections)
        const result = await finalizeChunkedFullResync()
        const finishedAt = result.finishedAt ?? new Date().toISOString()
        const tableStats = collectWriteDatabaseTableStats()
        const byBucket = countWriteDbListingsByBucket()
        const listingTotal =
          countWriteDbListings() ||
          tableStats.find((row) => row.table === 'listings')?.queried ||
          result.totalUpserted
        const chunkProgress = await readChunkedFullResyncProgress()
        saveAdminSyncTableStats('full-resync', tableStats)
        return {
          ok: true,
          action,
          startedAt: result.startedAt ?? startedAt,
          finishedAt,
          durationMs: result.durationMs || Date.now() - t0,
          recordsFetched: listingTotal,
          message: `Full resync complete — ${listingTotal.toLocaleString()} listings`,
          detail: formatFullResyncCompleteDetail({
            listingTotal,
            byBucket,
            fetchedTotal: chunkProgress?.fetchedTotal,
            tables: tableStats,
          }),
        }
      }
      if (options.town) {
        if (!isTmreTown(options.town)) {
          const finishedAt = new Date().toISOString()
          return {
            ok: false,
            action,
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            message: `Unknown town: ${options.town}`,
          }
        }
        await prepareListingsDbForChunkedSync(listingsDbPath(), resetListingsDbConnections)
        const townResults = await syncFullResyncTown(options.town)
        const ok = townResults.every((row) => row.ok)
        const failed = townResults.filter((row) => !row.ok)
        const upserts = townResults.reduce((sum, row) => sum + row.count, 0)
        const townIndex = TMRE_TOWNS.indexOf(options.town) + 1
        const sqliteTotal = countWriteDbListings()
        const tableStats = collectWriteDatabaseTableStats()
        const priorProgress = (await readChunkedFullResyncProgress()) ?? {
          fetchedTotal: 0,
          townsCompleted: [],
          updatedAt: startedAt,
        }
        await saveChunkedFullResyncProgress({
          fetchedTotal: priorProgress.fetchedTotal + upserts,
          townsCompleted: [...new Set([...priorProgress.townsCompleted, options.town])],
          updatedAt: new Date().toISOString(),
        })
        const finishedAt = new Date().toISOString()
        return {
          ok,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          recordsFetched: upserts,
          townResults,
          message: ok
            ? `${options.town} synced — ${upserts.toLocaleString()} records fetched`
            : `${options.town} finished with ${failed.length} failure(s)`,
          detail: formatFullResyncTownProgressWithTables({
            town: options.town,
            townIndex,
            townCount: TMRE_TOWNS.length,
            townResults,
            sqliteTotal,
            tables: tableStats,
          }),
        }
      }
      if (isServerlessRuntime()) {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Full resync must run town-by-town on serverless — use Sync now (client chunks automatically)',
        }
      }
      const result = await syncAllTownListings()
      const ok = result.towns.length > 0 && result.towns.every((row) => row.ok)
      const failed = result.towns.filter((row) => !row.ok)
      const finishedAt = result.finishedAt ?? new Date().toISOString()
      return {
        ok,
        action,
        startedAt: result.startedAt ?? startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.totalUpserted,
        townResults: result.towns,
        message: ok
          ? `Full resync complete — ${result.totalUpserted.toLocaleString()} listings`
          : failed.length
            ? `Full resync finished with ${failed.length} town failure(s)`
            : 'Full resync returned no town results',
        detail: ok
          ? formatTownSyncSummary(result.towns, 'records fetched')
          : formatSyncFailures(failed),
      }
    }
    case 'incremental': {
      if (!isRetsConfigured()) {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Incremental sync skipped — RETS not configured on this host',
          detail: retsSyncBlockedMessage(),
        }
      }
      await ensureListingsDbHydrated(resetListingsDbConnections)
      if (getSyncMeta('refresh_in_progress') === '1') {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Incremental blocked — another refresh is in progress',
          detail:
            'Clear the refresh lock on admin (Refresh lock panel) or wait ~8 minutes for auto-heal on serverless.',
        }
      }
      const result = await syncIncrementalListings()
      const skipped =
        result.durationMs === 0 && result.towns.length === 0 && result.totalUpserted === 0
      const ok = !skipped && result.towns.every((row) => row.ok)
      const failed = result.towns.filter((row) => !row.ok)
      const finishedAt = result.finishedAt ?? new Date().toISOString()
      return {
        ok,
        action,
        startedAt: result.startedAt ?? startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.totalUpserted,
        townResults: result.towns,
        message: ok
          ? `Incremental sync complete — ${result.totalUpserted.toLocaleString()} upserts`
          : skipped
            ? 'Incremental skipped — refresh lock held or RETS unavailable'
            : `Incremental sync finished with ${failed.length} failure(s)`,
        detail: skipped
          ? 'Clear refresh lock on admin or wait ~8 minutes for serverless auto-heal.'
          : ok
            ? formatTownSyncSummary(result.towns, 'modified listings upserted')
            : formatSyncFailures(failed),
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
        recordsFetched: result.totalScored,
        message: `Scored ${result.totalScored.toLocaleString()} Active listings`,
        detail: `Goldilocks scores rebuilt for ${result.totalScored.toLocaleString()} Active listings across ${result.towns.length} towns`,
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
        detail: `Copied write DB → listings.read.db (${getListingsDbStats().total.toLocaleString()} listings visible to read APIs)`,
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
        recordsFetched: result.written,
        message: `Stats cache rebuilt — ${result.written.toLocaleString()} entries`,
        detail: `Recomputed ${result.written.toLocaleString()} stats_cache objects (sales, vintage, price, active-by-month)`,
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
        recordsFetched: result.written,
        message: `Deal of the Day cache rebuilt — ${result.written.toLocaleString()} entries`,
        detail: `Wrote ${result.written.toLocaleString()} Deal of the Day picks (all towns × kinds)`,
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
        recordsFetched: result.totalRows,
        message: `${result.totalRows.toLocaleString()} addresses synced`,
        detail: `${result.mlsRows.toLocaleString()} MLS rows · ${result.assessorRows.toLocaleString()} assessor rows verified`,
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
  const scheduleHints = buildAdminSyncScheduleHints()
  return { stats, refresh, nextRuns, scheduleHints }
}
