import 'server-only'

import { rebuildDealOfTheDayCache } from '@/lib/deal-of-the-day-cache'
import { rebuildAllListingScores } from '@/lib/listing-scores-rebuild'
import {
  countListings,
  countListingsByBucket,
  readListingsDbStats,
  recordDashboardSyncAudit,
  recordIncrementalQueueAudit,
} from '@/lib/db/listings-repo'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  getSyncMeta,
  hydrateSyncMetaStore,
  setSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { stampIncrementalSyncLive } from '@/lib/incremental-sync-live'
import {
  formatIncrementalStepLog,
  readIncrementalStepLog,
  stampIncrementalQueuedStepLog,
} from '@/lib/incremental-sync-step-log'
import {
  formatIncrementalUpsertStats,
  readIncrementalUpsertHistory,
  readLastIncrementalUpsertStatsFresh,
  upsertLabelFromStepSummary,
} from '@/lib/incremental-upsert-stats'
import {
  clearChunkedFullResyncProgress,
  readChunkedFullResyncProgress,
  saveChunkedFullResyncProgress,
} from '@/lib/db/chunked-resync-progress'
import { ensureAdminListingPhotosReady } from '@/lib/listing-photos-db-persist'
import {
  syncAllTownListings,
  syncIncrementalListings,
  syncFullResyncTown,
  finalizeChunkedFullResync,
  runFullResyncFinalizeStep,
  type TownSyncResult,
} from '@/lib/listings-sync'
import { isRetsConfigured, retsSyncBlockedMessage } from '@/lib/rets'
import { isTmreTown, TMRE_TOWNS } from '@/lib/tmre-towns'
import {
  formatFullResyncCompleteDetail,
  formatFullResyncTownProgressWithTables,
  formatFullResyncFinalizeStepDetail,
  formatTownSyncSummary,
} from '@/lib/admin-sync-progress'
import { rebuildStatsCache } from '@/lib/stats-cache'
import { readListingsRefreshStatus, healStaleRefreshLock } from '@/lib/listings-refresh-status'
import { buildAdminSyncNextRuns, buildAdminSyncScheduleHints } from '@/lib/admin-sync-schedule'
import {
  clearSyncNextOverrideAfterRun,
  isSyncNextOverrideJobId,
  readSyncNextOverrides,
} from '@/lib/sync-next-override'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  collectWriteDatabaseTableStats,
  saveAdminSyncTableStats,
} from '@/lib/sqlite-sync-stats'
import type { AdminSyncActionId, AdminSyncAllActionId } from '@/lib/admin-sync-types'
import {
  ADMIN_SYNC_ACTIONS,
  ADMIN_SYNC_ALL_SEQUENCE,
  FULL_RESYNC_FINALIZE_STEPS,
  isFullResyncFinalizeStepId,
} from '@/lib/admin-sync-types'
import { isScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  readSyncScheduleConfigFresh,
  resolveJobScheduler,
} from '@/lib/sync-schedule-config'
import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'

/**
 * Sync now handoff order:
 * 1) Railway mls-sync when Configure Scheduler is railway (Incremental)
 * 2) EventBridge dispatch when Configure says eventbridge
 * 3) Netlify admin background queue
 */
async function queueSyncNowPreferringScheduler(
  jobId: string,
  adminQueue: () => Promise<NetlifyFunctionQueueResult>,
  opts?: {
    allowEventBridge?: boolean
    railwayBody?: {
      startedAt: string
      towns?: string[]
      statusScope?: 'all' | 'active' | 'closed'
    }
  },
): Promise<{
  queued: NetlifyFunctionQueueResult
  via: 'railway' | 'eventbridge' | 'admin'
}> {
  if (isScheduledSyncJobId(jobId)) {
    const config = await readSyncScheduleConfigFresh()
    const scheduler = resolveJobScheduler(config.jobs[jobId])

    if (scheduler === 'railway') {
      const { queueMlsSyncServiceRun } = await import(
        '@/lib/mls-sync-service-client'
      )
      const queued = await queueMlsSyncServiceRun({
        startedAt: opts?.railwayBody?.startedAt,
        source: 'admin',
        towns: opts?.railwayBody?.towns,
        statusScope: opts?.railwayBody?.statusScope,
      })
      return { queued, via: 'railway' }
    }

    const allowEventBridge = opts?.allowEventBridge !== false
    if (allowEventBridge && scheduler === 'eventbridge') {
      const { dispatchEventBridgeScheduledJob } = await import(
        '@/lib/eventbridge-sync-dispatch'
      )
      const eb = await dispatchEventBridgeScheduledJob(jobId, {
        fromAdminSyncNow: true,
      })
      if (eb.ok && eb.queue) {
        return { queued: eb.queue, via: 'eventbridge' }
      }
    }
  }

  return { queued: await adminQueue(), via: 'admin' }
}

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
  /** True when work was handed off to a Netlify background function. */
  backgroundQueued?: boolean
  /** Human label when this step is not a primary panel action (sync-all extras). */
  stepLabel?: string
  /** Finalize step IDs completed so far this chunked full-resync run (see `finalizeStep`). */
  finalizeStepsCompleted?: string[]
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
  /**
   * Adhoc Incremental scope — omit / empty = all TMRE towns.
   * When set to a single TMRE town, only that town is pulled.
   */
  towns?: string[]
  /**
   * Adhoc Incremental status filter — `all` (default) | `active` | `closed`.
   * `active` = Active + Coming Soon + UC + UC-CTS. `closed` = Closed only.
   */
  statusScope?: 'all' | 'active' | 'closed'
  /** Run ALL finalize cache rebuilds in one shot (non-serverless / local-dev only). */
  finalize?: boolean
  /** One finalize step of a chunked full resync (see `FULL_RESYNC_FINALIZE_STEPS`). */
  finalizeStep?: string
}

/** status_bucket suffix → Sync History sync-type group (see normalizeSyncType). */
const DASHBOARD_SYNC_AUDIT_SUFFIX: Record<AdminSyncActionId, string> = {
  'full-resync': 'full',
  incremental: 'incremental',
  'listing-scores': 'goldilocks',
  'edge-scores': 'edge',
  'publish-snapshot': 'snapshot',
  'stats-cache': 'stats',
  'deal-of-the-day': 'deal-day',
  'property-addresses': 'addresses',
  'vision-addresses': 'vision',
  'zip-boundaries': 'zip-maps',
  'fomc-sync': 'fomc',
  'cpi-sync': 'cpi',
  'market-digest': 'digest',
}

/** Finalize-step → Sync History type (weekly full resync chain). */
const FINALIZE_STEP_AUDIT_SUFFIX: Partial<
  Record<(typeof FULL_RESYNC_FINALIZE_STEPS)[number], string>
> = {
  scores: 'goldilocks',
  'stats-cache': 'stats',
  'deal-of-day': 'deal-day',
  persist: 'snapshot',
}

async function auditDashboardSyncResult(
  result: AdminSyncActionResult,
  options: AdminSyncActionOptions,
): Promise<void> {
  // Per-town RETS chunks already write town sync_runs rows.
  if (options.town) return
  // Background queue already wrote Queued/incremental — Done comes from the worker.
  if (result.backgroundQueued) return

  let syncSuffix: string | undefined
  if (options.finalizeStep && isFullResyncFinalizeStepId(options.finalizeStep)) {
    syncSuffix = FINALIZE_STEP_AUDIT_SUFFIX[options.finalizeStep]
  } else {
    syncSuffix = DASHBOARD_SYNC_AUDIT_SUFFIX[result.action]
  }
  if (!syncSuffix) return

  const detail = [result.message, result.detail].filter(Boolean).join(' — ')
  await recordDashboardSyncAudit({
    startedAt: result.startedAt,
    finishedAt: result.finishedAt || new Date().toISOString(),
    syncSuffix,
    listingsCount: result.recordsFetched ?? 0,
    ok: result.ok,
    detail,
  })
}

export async function runAdminSyncAction(
  action: AdminSyncActionId,
  options: AdminSyncActionOptions = {},
): Promise<AdminSyncActionResult> {
  const result = await runAdminSyncActionImpl(action, options)
  if (result.ok && isSyncNextOverrideJobId(result.action)) {
    await clearSyncNextOverrideAfterRun(result.action)
  }
  await auditDashboardSyncResult(result, options)
  return result
}

async function runAdminSyncActionImpl(
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
        await ensureAdminListingPhotosReady()
        const result = await finalizeChunkedFullResync()
        const finishedAt = result.finishedAt ?? new Date().toISOString()
        if (!getSyncMeta('last_full_sync')) {
          setSyncMeta('last_full_sync', finishedAt)
        }
        const tableStats = await collectWriteDatabaseTableStats()
        const byBucket = await countListingsByBucket()
        const listingTotal =
          (await countListings()) ||
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
      if (options.finalizeStep) {
        const stepId = options.finalizeStep
        if (!isFullResyncFinalizeStepId(stepId)) {
          const finishedAt = new Date().toISOString()
          return {
            ok: false,
            action,
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            message: `Unknown finalize step: ${stepId}`,
          }
        }
        await ensureAdminListingPhotosReady()
        const stepResult = await runFullResyncFinalizeStep(stepId)
        const finishedAt = new Date().toISOString()
        const priorProgress = (await readChunkedFullResyncProgress()) ?? {
          fetchedTotal: 0,
          townsCompleted: [],
          finalizeStepsCompleted: [],
          updatedAt: startedAt,
        }
        const finalizeStepsCompleted = stepResult.ok
          ? [...new Set([...(priorProgress.finalizeStepsCompleted ?? []), stepId])]
          : (priorProgress.finalizeStepsCompleted ?? [])
        await saveChunkedFullResyncProgress({
          ...priorProgress,
          finalizeStepsCompleted,
          updatedAt: finishedAt,
        })

        const stepIndex = FULL_RESYNC_FINALIZE_STEPS.indexOf(stepId) + 1
        const stepCount = FULL_RESYNC_FINALIZE_STEPS.length

        if (!stepResult.ok) {
          return {
            ok: false,
            action,
            startedAt,
            finishedAt,
            durationMs: stepResult.durationMs || Date.now() - t0,
            finalizeStepsCompleted,
            message: `Finalize step ${stepIndex}/${stepCount} (${stepId}) failed`,
            detail: stepResult.error,
          }
        }

        const isLastStep = stepId === FULL_RESYNC_FINALIZE_STEPS[FULL_RESYNC_FINALIZE_STEPS.length - 1]
        if (!isLastStep) {
          return {
            ok: true,
            action,
            startedAt,
            finishedAt,
            durationMs: stepResult.durationMs || Date.now() - t0,
            finalizeStepsCompleted,
            message: `Finalizing step ${stepIndex}/${stepCount} (${stepId}) complete`,
            detail: formatFullResyncFinalizeStepDetail({ stepId, stepIndex, stepCount }),
          }
        }

        // Last step done — the full resync is truly complete now.
        if (!getSyncMeta('last_full_sync')) {
          setSyncMeta('last_full_sync', finishedAt)
        }
        const tableStats = await collectWriteDatabaseTableStats()
        const byBucket = await countListingsByBucket()
        const listingTotal =
          (await countListings()) ||
          tableStats.find((row) => row.table === 'listings')?.queried ||
          stepResult.totalListings ||
          0
        saveAdminSyncTableStats('full-resync', tableStats)
        return {
          ok: true,
          action,
          startedAt,
          finishedAt,
          durationMs: stepResult.durationMs || Date.now() - t0,
          recordsFetched: listingTotal,
          finalizeStepsCompleted,
          message: `Full resync complete — ${listingTotal.toLocaleString()} listings`,
          detail: formatFullResyncCompleteDetail({
            listingTotal,
            byBucket,
            fetchedTotal: priorProgress.fetchedTotal,
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
        await ensureAdminListingPhotosReady()
        const townResults = await syncFullResyncTown(options.town)
        const ok = townResults.every((row) => row.ok)
        const failed = townResults.filter((row) => !row.ok)
        const upserts = townResults.reduce((sum, row) => sum + row.count, 0)
        const townIndex = TMRE_TOWNS.indexOf(options.town) + 1
        const sqliteTotal = await countListings()
        const tableStats = await collectWriteDatabaseTableStats()
        const priorProgress = (await readChunkedFullResyncProgress()) ?? {
          fetchedTotal: 0,
          townsCompleted: [],
          finalizeStepsCompleted: [],
          updatedAt: startedAt,
        }
        // Preserve finalizeStepsCompleted — a re-run of the town loop after a finalize-step
        // failure should resume finalize from where it left off, not redo completed steps.
        await saveChunkedFullResyncProgress({
          fetchedTotal: priorProgress.fetchedTotal + upserts,
          townsCompleted: [...new Set([...priorProgress.townsCompleted, options.town])],
          finalizeStepsCompleted: priorProgress.finalizeStepsCompleted ?? [],
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
          finalizeStepsCompleted: priorProgress.finalizeStepsCompleted ?? [],
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
      await ensureAdminListingPhotosReady()
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
      // Adhoc scope: optional single town (or list) from Admin town picker.
      const scopedTowns = (options.towns?.length
        ? options.towns
        : options.town
          ? [options.town]
          : []
      )
        .map((t) => t.trim())
        .filter((t): t is (typeof TMRE_TOWNS)[number] => isTmreTown(t))
      if (
        (options.towns?.length || options.town) &&
        scopedTowns.length === 0
      ) {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: `Unknown town: ${options.town ?? options.towns?.join(', ')}`,
        }
      }
      const townScopeLabel =
        scopedTowns.length === 0
          ? 'all towns'
          : scopedTowns.length === 1
            ? scopedTowns[0]
            : scopedTowns.join(', ')
      const statusScope: 'all' | 'active' | 'closed' =
        options.statusScope === 'active' || options.statusScope === 'closed'
          ? options.statusScope
          : 'all'
      const statusScopeLabel =
        statusScope === 'all'
          ? 'Active+CS+UC+Closed'
          : statusScope === 'active'
            ? 'Active+CS+UC'
            : 'Closed'
      const scopeLabel = `${townScopeLabel} · ${statusScopeLabel}`

      // Production: never await 7-town RETS in the Next.js request — Netlify
      // gateway returns HTML 504 before maxDuration. Same handoff as scheduled cron.
      if (isServerlessRuntime()) {
        const { queueNetlifyIncrementalSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        // Town/status scope is Admin-only — EventBridge schedule is all-towns.
        const scoped =
          scopedTowns.length > 0 || statusScope !== 'all'
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'incremental',
          () =>
            queueNetlifyIncrementalSync(startedAt, {
              source: 'admin',
              ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
              ...(statusScope !== 'all' ? { statusScope } : {}),
            }),
          {
            allowEventBridge: !scoped,
            railwayBody: {
              startedAt,
              ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
              ...(statusScope !== 'all' ? { statusScope } : {}),
            },
          },
        )
        const queueSource =
          via === 'eventbridge'
            ? 'eventbridge'
            : via === 'railway'
              ? 'admin'
              : 'admin'
        // Always write Sync history — queue ack alone never created town sync_runs,
        // which left "last run" stuck at the prior real RETS batch (e.g. 2:47pm).
        await recordIncrementalQueueAudit({
          startedAt,
          source: queueSource,
          queued: queued.ok,
          detail: queued.ok
            ? `${queued.base ?? 'site'} HTTP ${queued.status ?? '—'} · ${scopeLabel}${
                via === 'railway'
                  ? ' · via Railway mls-sync'
                  : via === 'eventbridge'
                    ? ' · via EventBridge'
                    : ''
              }`
            : queued.error ?? 'unknown queue error',
        })
        if (queued.ok) {
          // Mark Start immediately — End stays on the prior success until the
          // pull finishes (instant HTTP response is expected, not a real sync).
          await setSyncMetaDurable('last_incremental_sync_started', startedAt)
          await stampIncrementalSyncLive({
            phase: 'queued',
            town: scopedTowns.length === 1 ? scopedTowns[0]! : null,
            townIndex: null,
            townCount:
              scopedTowns.length > 0 ? scopedTowns.length : TMRE_TOWNS.length,
            updatedAt: startedAt,
            ...(scopedTowns.length > 0 ? { scopeTowns: [...scopedTowns] } : {}),
            statusScope,
          })
          await stampIncrementalQueuedStepLog(
            via === 'railway'
              ? 'railway-admin'
              : via === 'eventbridge'
                ? 'eventbridge-admin'
                : 'admin-queue',
            queued.base
              ? `${queued.base} HTTP ${queued.status ?? '—'} · ${scopeLabel}`
              : `background worker · ${scopeLabel}`,
          )
          const viaLabel =
            via === 'railway'
              ? 'Railway mls-sync'
              : via === 'eventbridge'
                ? 'EventBridge path'
                : 'Netlify background worker'
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message: `Incremental queued for ${scopeLabel} (${viaLabel})`,
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}) · ${scopeLabel}${
                  via === 'railway' ? ' · Railway' : via === 'eventbridge' ? ' · EventBridge' : ''
                }. Dashboard Status updates when End moves in Neon.`
              : `Queued on ${viaLabel} · ${scopeLabel}. Dashboard Status updates when End moves in Neon.`,
          }
        }
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Could not queue incremental sync',
          detail:
            queued.error ??
            (via === 'railway'
              ? 'Set MLS_SYNC_SERVICE_URL + SYNC_CRON_SECRET (Railway mls-sync).'
              : 'No site URL or worker rejected the queue. Check SYNC_CRON_SECRET / URL env and Netlify function logs.'),
        }
      }
      const result = await syncIncrementalListings({
        ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
        ...(statusScope !== 'all' ? { statusScope } : {}),
      })
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
          ? `Incremental sync complete (${scopeLabel}) — ${result.totalUpserted.toLocaleString()} upserts`
          : skipped
            ? 'Incremental skipped — refresh lock held or RETS unavailable'
            : `Incremental sync finished with ${failed.length} failure(s) (${scopeLabel})`,
        detail: skipped
          ? 'Clear refresh lock on admin or wait ~8 minutes for serverless auto-heal.'
          : ok
            ? formatTownSyncSummary(result.towns, 'modified listings upserted')
            : formatSyncFailures(failed),
      }
    }
    case 'listing-scores': {
      if (isServerlessRuntime()) {
        const { queueNetlifyListingScoresSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'listing-scores',
          () =>
            queueNetlifyListingScoresSync(startedAt, {
              source: 'admin',
            }),
        )
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/goldilocks' : 'Failed/goldilocks',
            listingsCount: 0,
            ok: queued.ok,
            error: queued.ok
              ? `queued background worker (${via}) — ${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`
              : `queue failed (${via}) — ${queued.error ?? 'Could not reach background worker'}`,
          })
        } catch {
          /* audit best-effort */
        }
        if (queued.ok) {
          await setSyncMetaDurable('last_listing_scores_started', startedAt)
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              via === 'eventbridge'
                ? 'Goldilocks queued (EventBridge path) — End updates when rebuild finishes'
                : 'Goldilocks queued (background worker) — End updates when rebuild finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}).`
              : 'Queued on background worker.',
          }
        }
        return {
          ok: false,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          message: 'Goldilocks queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
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
    case 'edge-scores': {
      if (isServerlessRuntime()) {
        const { queueNetlifyListingEdgeScoreSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'edge-scores',
          () => queueNetlifyListingEdgeScoreSync(startedAt, { source: 'admin' }),
        )
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/edge' : 'Failed/edge',
            listingsCount: 0,
            ok: queued.ok,
            error: queued.ok
              ? `queued background worker (${via}) — ${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`
              : `queue failed (${via}) — ${queued.error ?? 'Could not reach background worker'}`,
          })
        } catch {
          /* audit best-effort */
        }
        if (queued.ok) {
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              via === 'eventbridge'
                ? 'Edge scores queued (EventBridge path) — End updates when rebuild finishes'
                : 'Edge scores queued (background worker) — End updates when rebuild finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}).`
              : 'Queued on background worker.',
          }
        }
        return {
          ok: false,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          message: 'Edge scores queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
      const { rebuildAllListingEdgeScores } = await import(
        '@/lib/listing-edge-score'
      )
      const result = await rebuildAllListingEdgeScores()
      return {
        ok: true,
        action,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.scored,
        message: `Edge scores rebuilt — ${result.scored.toLocaleString()} listings`,
        detail: `Wrote listing_edge_scores for ${result.scored.toLocaleString()} listings`,
      }
    }
    case 'publish-snapshot': {
      setSyncMeta('last_refresh_started_at', startedAt)
      const finishedAt = new Date().toISOString()
      setSyncMeta('last_refresh_finished_at', finishedAt)
      const stats = await readListingsDbStats()
      return {
        ok: true,
        action,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        message: 'Refresh finished stamped',
        detail: `Neon Postgres read path — ${stats.total.toLocaleString()} listings available to read APIs`,
      }
    }
    case 'stats-cache': {
      // Production: full rebuild is too heavy for the Next.js request (gateway
      // 504 leaves stats_cache_rebuild_lock held → later clicks report "0 entries").
      if (isServerlessRuntime()) {
        const { queueNetlifyStatsCacheRebuild } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'stats-cache',
          () =>
            queueNetlifyStatsCacheRebuild(startedAt, {
              source: 'admin',
            }),
        )
        // History: Queued/stats now; worker writes Done|Failed/stats when finished.
        // (backgroundQueued skips auditDashboardSyncResult — same as Incremental.)
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/stats' : 'Failed/stats',
            listingsCount: 0,
            ok: queued.ok,
            error: queued.ok
              ? `queued background worker (${via}) — ${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`
              : `queue failed (${via}) — ${queued.error ?? 'Could not reach background worker'}`,
          })
        } catch {
          /* audit best-effort */
        }
        if (queued.ok) {
          await setSyncMetaDurable('last_stats_cache_started', startedAt)
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              via === 'eventbridge'
                ? 'Stats cache queued (EventBridge path) — End updates when rebuild finishes'
                : 'Stats cache queued (background worker) — End updates when rebuild finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}). Steals a stuck rebuild lock if needed.`
              : 'Queued on background worker. Steals a stuck rebuild lock if needed.',
          }
        }
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Stats cache queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
      const result = await rebuildStatsCache({ trackRefresh: true, force: true })
      const finishedAt = new Date().toISOString()
      if (result.skipped) {
        const why =
          result.skipReason === 'lock'
            ? 'rebuild lock held by another process'
            : result.skipReason === 'no-listings'
              ? 'no listings in Postgres yet'
              : result.skipReason === 'not-stale'
                ? 'cache still fresh'
                : 'skipped'
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: result.durationMs || Date.now() - t0,
          recordsFetched: 0,
          message: `Stats cache skipped — ${why}`,
          detail:
            result.skipReason === 'lock'
              ? 'Wait for the other rebuild, or clear stats_cache_rebuild_lock in sync_meta if a dead Lambda left it stuck.'
              : `No stats_cache rows written (${why}).`,
        }
      }
      if (result.written === 0) {
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: result.durationMs || Date.now() - t0,
          recordsFetched: 0,
          message: 'Stats cache rebuilt — 0 entries',
          detail:
            'Rebuild finished but wrote nothing — check listings inventory and Neon connectivity.',
        }
      }
      return {
        ok: true,
        action,
        startedAt,
        finishedAt,
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.written,
        message: `Stats cache rebuilt — ${result.written.toLocaleString()} entries`,
        detail: `Recomputed ${result.written.toLocaleString()} stats_cache objects (sales, vintage, price, months-supply, DOM/median calc explainers for bar hover)`,
      }
    }
    case 'deal-of-the-day': {
      if (isServerlessRuntime()) {
        const { queueNetlifyDealOfTheDayRebuild } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'deal-of-the-day',
          () =>
            queueNetlifyDealOfTheDayRebuild(startedAt, {
              source: 'admin',
            }),
        )
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/deal-day' : 'Failed/deal-day',
            listingsCount: 0,
            ok: queued.ok,
            error: queued.ok
              ? `queued background worker (${via}) — ${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`
              : `queue failed (${via}) — ${queued.error ?? 'Could not reach background worker'}`,
          })
        } catch {
          /* audit best-effort */
        }
        if (queued.ok) {
          await setSyncMetaDurable('last_deal_of_the_day_cache_started', startedAt)
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              via === 'eventbridge'
                ? 'Deal of the Day queued (EventBridge path) — End updates when rebuild finishes'
                : 'Deal of the Day queued (background worker) — End updates when rebuild finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}).`
              : 'Queued on background worker.',
          }
        }
        return {
          ok: false,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          message: 'Deal of the Day queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
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
    case 'vision-addresses': {
      const { syncVisionAddresses } = await import('@/lib/vision-gis-sync')
      const result = await syncVisionAddresses()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt: result.syncedAt,
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.parcelsFetched,
        message: `${result.town}: ${result.totalRows.toLocaleString()} vision rows (${result.phase})`,
        detail: result.detail,
      }
    }
    case 'zip-boundaries': {
      const { syncAllTmreZipBoundaries } = await import('@/lib/zip-boundary-cache')
      const result = await syncAllTmreZipBoundaries()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.written,
        message: `${result.written.toLocaleString()} zip boundaries synced`,
        detail: [
          result.failed.length > 0
            ? `Wrote ${result.written}; failed: ${result.failed.join(', ')}`
            : `All mappable TMRE town ZCTAs from Census TIGERweb → zip_boundaries`,
          // PO-box zips have no ZCTA. Reported, not counted as failures.
          result.skipped.length > 0
            ? `no ZCTA (expected): ${result.skipped.join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
    case 'fomc-sync': {
      if (isServerlessRuntime()) {
        const { queueNetlifyFomcSync } = await import('@/lib/netlify-sync-trigger')
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'fomc-sync',
          () => queueNetlifyFomcSync({ source: 'admin' }),
        )
        return {
          ok: queued.ok,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          backgroundQueued: true,
          message: queued.ok
            ? via === 'eventbridge'
              ? 'FOMC sync queued via EventBridge path'
              : 'FOMC sync queued on Netlify background worker'
            : `FOMC sync queue failed: ${queued.error ?? 'unknown'}`,
        }
      }
      const { runFedFomcSync } = await import('@/lib/fed-fomc-sync')
      const { setSyncMetaDurable } = await import('@/lib/db/sync-meta-store')
      const { etYmd } = await import('@/lib/fed-event-sync-schedule')
      const { FOMC_MEETINGS } = await import('@/lib/fed-fomc-calendar')
      const result = await runFedFomcSync()
      const finishedAt = result.syncedAt
      const today = etYmd()
      const todayMeeting = FOMC_MEETINGS.find((m) => m.endDate === today)
      const eventId =
        todayMeeting?.id ??
        result.meetings.find((m) => m.ok && !m.skipped)?.id ??
        null
      if ((result.ok || result.updated > 0) && eventId) {
        await setSyncMetaDurable('fomc_last_synced_event_id', eventId)
      }
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        recordsFetched: result.updated,
        message: `FOMC sync — updated ${result.updated}, fetched ${result.fetched}`,
        detail: `skipped ${result.skipped} · failed ${result.failed}`,
      }
    }
    case 'cpi-sync': {
      if (isServerlessRuntime()) {
        const { queueNetlifyCpiSync } = await import('@/lib/netlify-sync-trigger')
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'cpi-sync',
          () => queueNetlifyCpiSync({ source: 'admin' }),
        )
        return {
          ok: queued.ok,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          backgroundQueued: true,
          message: queued.ok
            ? via === 'eventbridge'
              ? 'CPI sync queued via EventBridge path'
              : 'CPI sync queued on Netlify background worker'
            : `CPI sync queue failed: ${queued.error ?? 'unknown'}`,
        }
      }
      const { runCpiReleaseSync } = await import('@/lib/cpi-release-sync')
      const { setSyncMetaDurable } = await import('@/lib/db/sync-meta-store')
      const { etYmd } = await import('@/lib/fed-event-sync-schedule')
      const { CPI_RELEASES } = await import('@/lib/cpi-calendar')
      const result = await runCpiReleaseSync()
      const finishedAt = result.syncedAt
      const today = etYmd()
      const todayRelease = CPI_RELEASES.find((r) => r.releaseDate === today)
      const eventId =
        todayRelease?.id ??
        result.releases.find((r) => r.ok && !r.skipped)?.id ??
        null
      if ((result.ok || result.updated > 0) && eventId) {
        await setSyncMetaDurable('cpi_last_synced_event_id', eventId)
      }
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        recordsFetched: result.updated,
        message: `CPI sync — updated ${result.updated}, fetched ${result.fetched}`,
        detail: `skipped ${result.skipped} · failed ${result.failed}`,
      }
    }
    case 'market-digest': {
      if (isServerlessRuntime()) {
        const { queueNetlifyMarketDigest } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowPreferringScheduler(
          'market-digest',
          () =>
            queueNetlifyMarketDigest({
              source: 'admin',
              force: true,
              stampWeek: true,
            }),
        )
        return {
          ok: queued.ok,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          backgroundQueued: true,
          message: queued.ok
            ? via === 'eventbridge'
              ? 'Monday market brief queued via EventBridge path'
              : 'Monday market brief queued on Netlify background worker'
            : `Market brief queue failed: ${queued.error ?? 'unknown'}`,
        }
      }
      const { sendMarketDigestEmail } = await import('@/lib/market-digest-notify')
      const result = await sendMarketDigestEmail({
        force: true,
        stampWeek: true,
      })
      const finishedAt = new Date().toISOString()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        message: result.skipped
          ? `Market brief skipped — ${result.reason ?? 'skipped'}`
          : `Market brief sent to ${result.to ?? 'recipient'}`,
        detail: result.subject
          ? `week ${result.weekKey ?? '—'} · ${result.subject}`
          : result.reason,
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

/** Run every admin cache action in Configure order (stops on first failure). */
export async function runAdminSyncAllCaches(): Promise<AdminSyncAllResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const steps: AdminSyncActionResult[] = []
  const { readSyncScheduleConfig, syncAllClientStepsFromConfig } = await import(
    '@/lib/sync-schedule-config'
  )
  // Server Sync all uses the same ordered list as the client (minus publish-snapshot
  // extras handled below via runAdminSyncAllExtraCaches).
  const sequence = syncAllClientStepsFromConfig(readSyncScheduleConfig()).filter(
    (id) => id !== 'publish-snapshot',
  )

  for (const actionId of sequence) {
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
      message: 'Sync all stopped at refresh finished',
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

export async function readAdminSyncPanelStatus() {
  // Cron / worker Lambdas stamp sync_meta on other instances. Re-hydrate so
  // Admin "Cron last fired", Start/End, and Next are not stuck on a stale
  // per-process cache (would show "never" after a real Netlify */30 tick).
  await hydrateSyncMetaStore()

  const {
    eventbridgeIngressAtKey,
    eventbridgeIngressResultKey,
    healStaleEventBridgeQueuedIncremental,
  } = await import('@/lib/eventbridge-ingress-stamp')
  // Drop forever-pink “queued — no End” after the hang window (EB toggle Day-1).
  // Run before stats so cleared Start is reflected in this poll.
  const healedEb = await healStaleEventBridgeQueuedIncremental()

  const stats = await readListingsDbStats()
  const refresh = readListingsRefreshStatus()
  const lastRefreshFinished = getSyncMeta('last_refresh_finished_at')
  const lastRefreshStarted = getSyncMeta('last_refresh_started_at')
  const { readSyncScheduleConfig } = await import('@/lib/sync-schedule-config')
  const scheduleConfig = readSyncScheduleConfig()
  const scheduleHints = buildAdminSyncScheduleHints()
  // Tick is Admin-truth — Fresh covers any race after hydrate.
  const lastIncrementalCronTick =
    (await getSyncMetaFresh('last_incremental_cron_tick')) ??
    getSyncMeta('last_incremental_cron_tick')
  const lastEventbridgeIngressAt =
    healedEb.at ??
    (await getSyncMetaFresh(eventbridgeIngressAtKey('incremental'))) ??
    getSyncMeta(eventbridgeIngressAtKey('incremental'))
  const lastEventbridgeIngressResult =
    healedEb.result ??
    (await getSyncMetaFresh(eventbridgeIngressResultKey('incremental'))) ??
    getSyncMeta(eventbridgeIngressResultKey('incremental'))
  const lastMlsSyncHeartbeat =
    (await getSyncMetaFresh('last_mls_sync_heartbeat')) ??
    getSyncMeta('last_mls_sync_heartbeat')
  // Next for EventBridge Incremental anchors on last AWS ingress — read first.
  const nextRuns = buildAdminSyncNextRuns(
    {
      lastFullSyncStarted: stats.lastFullSyncStarted,
      lastFullSync: stats.lastFullSync,
      lastIncrementalSyncStarted: stats.lastIncrementalSyncStarted,
      lastIncrementalSync: stats.lastIncrementalSync,
      lastListingScoresStarted: stats.lastListingScoresStarted,
      lastListingScores: stats.lastListingScores,
      lastListingEdgeScores: stats.lastListingEdgeScores,
      lastRefreshStarted,
      lastRefreshFinished: lastRefreshFinished ?? refresh.lastFinishedAt,
      lastStatsCacheStarted: stats.lastStatsCacheStarted,
      lastStatsCache: stats.lastStatsCache,
      lastDealOfTheDayCacheStarted: stats.lastDealOfTheDayCacheStarted,
      lastDealOfTheDayCache: stats.lastDealOfTheDayCache,
      lastEventbridgeIngressAt,
    },
    new Date(),
    scheduleConfig,
  )
  const nextOverrides = readSyncNextOverrides()
  const {
    clearIncrementalSyncLiveIfStale,
    formatIncrementalSyncLiveStatus,
  } = await import('@/lib/incremental-sync-live')
  // Drop dead Queued breadcrumbs so Status cannot claim a worker is starting
  // hours after the hop died (End is still the last finished pull).
  const incrementalLive = await clearIncrementalSyncLiveIfStale()
  const incrementalStepLog = readIncrementalStepLog()
  let latestFeedNewestMls: string | null = null
  let latestFeedRowCount = 0
  try {
    const { readLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
    const feed = await readLatestGlobalFeedCache(30)
    latestFeedRowCount = feed?.length ?? 0
    for (const row of feed ?? []) {
      const m = row.modificationTimestamp?.trim() || null
      if (!m) continue
      if (
        !latestFeedNewestMls ||
        Date.parse(m) > Date.parse(latestFeedNewestMls)
      ) {
        latestFeedNewestMls = m
      }
    }
  } catch {
    /* feed optional for panel */
  }

  const lastIncrementalUpserts = await readLastIncrementalUpsertStatsFresh()
  const incrementalUpsertHistory = readIncrementalUpsertHistory()
  const lastIncrementalUpsertsLabel =
    formatIncrementalUpsertStats(lastIncrementalUpserts) ??
    upsertLabelFromStepSummary(incrementalStepLog?.summary)

  return {
    stats,
    refresh,
    nextRuns,
    scheduleHints,
    scheduleConfig,
    lastIncrementalCronTick,
    lastEventbridgeIngressAt,
    lastEventbridgeIngressResult,
    lastMlsSyncHeartbeat,
    nextOverrides,
    incrementalLive,
    incrementalLiveStatus: formatIncrementalSyncLiveStatus(incrementalLive),
    incrementalStepLog,
    incrementalStepLogText: formatIncrementalStepLog(incrementalStepLog).trim(),
    latestFeedGeneratedAt: getSyncMeta('last_latest_global_feed'),
    latestFeedNewestMls,
    latestFeedRowCount,
    lastIncrementalUpserts,
    lastIncrementalUpsertsLabel,
    incrementalUpsertHistory,
  }
}
