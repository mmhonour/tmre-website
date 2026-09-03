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
import {
  rebuildStatsCache,
  reasonToSkipStatsCacheRebuild,
  stampStatsCacheQueueBackoff,
} from '@/lib/stats-cache'
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
import type { StatsCacheLastRun } from '@/lib/stats-dirty-towns'
import {
  ADMIN_SYNC_ACTIONS,
  ADMIN_SYNC_ALL_SEQUENCE,
  FULL_RESYNC_FINALIZE_STEPS,
  isFullResyncFinalizeStepId,
} from '@/lib/admin-sync-types'
import { isScheduledSyncJobId, isFullResyncRetired, FULL_RESYNC_RETIRED_MESSAGE } from '@/lib/scheduled-sync-jobs-shared'
import {
  SYNC_QUEUE_PRIORITY_MANUAL,
  isSyncQueueRunnerJob,
} from '@/lib/sync-queue-shared'
import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'

/**
 * Sync now handoff.
 *
 * Runner jobs go on `sync_queue` at manual priority and the runner is poked so
 * it drains without waiting for its next poll. Everything else still hands off
 * to a Netlify background function.
 *
 * There is no host to choose any more: the queue row is the request, and
 * whichever runner is alive claims it. Sync now that lands while something else
 * is in flight waits its turn instead of being answered with a 409 the dashboard
 * then painted as "Queued" for work nobody was holding.
 */
async function queueSyncNowThroughQueue(
  jobId: string,
  adminQueue: () => Promise<NetlifyFunctionQueueResult>,
  opts?: {
    payload?: Record<string, unknown>
    startedAt?: string
  },
): Promise<{
  queued: NetlifyFunctionQueueResult
  via: 'sync-queue' | 'admin'
  /** Set when the row was already waiting or running — not a new request. */
  queueNote?: string
}> {
  if (isScheduledSyncJobId(jobId) && isSyncQueueRunnerJob(jobId)) {
    const { enqueueSyncJob } = await import('@/lib/sync-queue')
    const enqueued = await enqueueSyncJob({
      jobId,
      trigger: 'admin',
      priority: SYNC_QUEUE_PRIORITY_MANUAL,
      payload: opts?.payload,
      requestedAt: opts?.startedAt,
      ignoreCooldown: true,
    })
    if (enqueued.ok) {
      // Best effort: the drain poll picks it up regardless.
      const { pokeMlsSyncServiceQueue } = await import(
        '@/lib/mls-sync-service-client'
      )
      const poke = await pokeMlsSyncServiceQueue(jobId).catch(() => null)
      return {
        queued: {
          ok: true,
          status: enqueued.enqueued ? 202 : 200,
          base: poke?.base ?? 'sync_queue',
        },
        via: 'sync-queue',
        ...(enqueued.reason ? { queueNote: enqueued.reason } : {}),
      }
    }
    return {
      queued: {
        ok: false,
        status: null,
        base: 'sync_queue',
        error: enqueued.reason ?? 'could not enqueue',
      },
      via: 'sync-queue',
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
  /**
   * Already inside a background worker / long-lived host: run the rebuild
   * here. Do not re-queue. Admin HTTP on Netlify must leave this unset.
   */
  executeInProcess?: boolean
  /**
   * Market brief only: send even though the slot says not to.
   *
   * Defaults to true, because every caller before the queue was an operator
   * pressing Sync now. A scheduled sweep must pass false — it enqueues on a
   * cadence, and the slot check is the only thing standing between that cadence
   * and a second Monday email to the whole list.
   */
  force?: boolean
  /**
   * Market brief only: advance the last-sent stamp on a successful send, which is
   * what marks the current slot served. Named for the day-keyed watermark it used
   * to move; the wire payload keeps the name so queued rows stay readable.
   *
   * Defaults to true. The Communications tab's test send passes false, because a
   * test that marked the slot served would silently cancel the real Monday brief
   * — and the only symptom would be an email nobody received.
   */
  stampWeek?: boolean
}

function shouldQueueOnServerless(options: AdminSyncActionOptions): boolean {
  return isServerlessRuntime() && options.executeInProcess !== true
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
  'open-houses': 'open-houses',
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
      if (isFullResyncRetired()) {
        const finishedAt = new Date().toISOString()
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          message: 'Full resync is retired',
          detail: FULL_RESYNC_RETIRED_MESSAGE,
        }
      }
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyIncrementalSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via, queueNote } = await queueSyncNowThroughQueue(
          'incremental',
          () =>
            queueNetlifyIncrementalSync(startedAt, {
              source: 'admin',
              ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
              ...(statusScope !== 'all' ? { statusScope } : {}),
            }),
          {
            startedAt,
            payload: {
              ...(scopedTowns.length > 0 ? { towns: scopedTowns } : {}),
              ...(statusScope !== 'all' ? { statusScope } : {}),
            },
          },
        )
        const queueSource = 'admin'
        // Always write Sync history — queue ack alone never created town sync_runs,
        // which left "last run" stuck at the prior real RETS batch (e.g. 2:47pm).
        await recordIncrementalQueueAudit({
          startedAt,
          source: queueSource,
          queued: queued.ok,
          detail: queued.ok
            ? `${queued.base ?? 'site'} HTTP ${queued.status ?? '—'} · ${scopeLabel}${
                via === 'sync-queue' ? ' · via sync queue' : ''
              }${queueNote ? ` · ${queueNote}` : ''}`
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
            via === 'sync-queue' ? 'sync-queue-admin' : 'admin-queue',
            queued.base
              ? `${queued.base} HTTP ${queued.status ?? '—'} · ${scopeLabel}`
              : `background worker · ${scopeLabel}`,
          )
          const viaLabel =
            via === 'sync-queue' ? 'sync queue' : 'Netlify background worker'
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message: `Incremental queued for ${scopeLabel} (${viaLabel})${
              queueNote ? ` — ${queueNote}` : ''
            }`,
            detail: `Queued on ${viaLabel} · ${scopeLabel}. Dashboard Status updates when End moves in Neon.`,
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
            (via === 'sync-queue'
              ? 'Could not write to sync_queue — check DATABASE_URL on this host.'
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyListingScoresSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowThroughQueue(
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
              via === 'sync-queue'
                ? 'Goldilocks queued on the sync runner — End updates when the rebuild finishes'
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyListingEdgeScoreSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowThroughQueue(
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
              'Edge scores queued (background worker) — End updates when rebuild finishes',
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
      if (shouldQueueOnServerless(options)) {
        // Rebuild-liveness only — the Netlify 429 backoff must not block Railway.
        const skipReason = await reasonToSkipStatsCacheRebuild()
        if (skipReason) {
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message: skipReason,
            detail: 'Not a rebuild failure — worker hop skipped.',
          }
        }
        const { queueNetlifyStatsCacheRebuild, isNetlifyQueueRateLimited } =
          await import('@/lib/netlify-sync-trigger')
        const { queued, via } = await queueSyncNowThroughQueue(
          'stats-cache',
          () =>
            queueNetlifyStatsCacheRebuild(startedAt, {
              source: 'admin',
            }),
        )
        // History: Queued/stats now; worker writes Done|Failed/stats when finished.
        // (backgroundQueued skips auditDashboardSyncResult — same as Incremental.)
        if (queued.ok) {
          try {
            const { recordSyncRun } = await import('@/lib/db/listings-repo')
            await recordSyncRun({
              startedAt,
              finishedAt: new Date().toISOString(),
              town: '(all)',
              statusBucket: 'Queued/stats',
              listingsCount: 0,
              ok: true,
              error: `queued background worker (${via}) — ${queued.base ?? 'site'} HTTP ${queued.status ?? '—'}`,
            })
          } catch {
            /* audit best-effort */
          }
          await setSyncMetaDurable('last_stats_cache_started', startedAt)
          return {
            ok: true,
            action,
            startedAt,
            finishedAt: startedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              via === 'sync-queue'
                ? 'Stats cache queued on the sync runner — End updates when the rebuild finishes'
                : 'Stats cache queued (background worker) — End updates when rebuild finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}). Steals a stuck rebuild lock if needed.`
              : 'Queued on background worker. Steals a stuck rebuild lock if needed.',
          }
        }
        const finishedAt = new Date().toISOString()
        if (isNetlifyQueueRateLimited(queued)) {
          await stampStatsCacheQueueBackoff()
          try {
            const { recordSyncRun } = await import('@/lib/db/listings-repo')
            await recordSyncRun({
              startedAt,
              finishedAt,
              town: '(all)',
              statusBucket: 'Failed/stats',
              listingsCount: 0,
              ok: false,
              error:
                'skipped — Netlify rate limited (HTTP 429); not retrying this window',
            })
          } catch {
            /* audit best-effort */
          }
          return {
            ok: true,
            action,
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message:
              'skipped — Netlify rate limited (HTTP 429); not retrying this window',
            detail: queued.error ?? 'HTTP 429',
          }
        }
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt,
            town: '(all)',
            statusBucket: 'Failed/stats',
            listingsCount: 0,
            ok: false,
            error: `queue failed (${via}) — ${queued.error ?? 'Could not reach background worker'}`,
          })
        } catch {
          /* audit best-effort */
        }
        return {
          ok: false,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          backgroundQueued: true,
          message: 'Stats cache queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
      const result = await rebuildStatsCache({
        trackRefresh: true,
        force: true,
        trigger: 'admin-sync-now',
      })
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyDealOfTheDayRebuild } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowThroughQueue(
          'deal-of-the-day',
          () =>
            queueNetlifyDealOfTheDayRebuild(startedAt, {
              source: 'admin',
            }),
          { startedAt },
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
              via === 'sync-queue'
                ? 'Deal of the Day queued on the sync runner — End updates when the rebuild finishes'
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
      // One upsert per property across every town plus Vision recent sales — too
      // long for a request-scoped Lambda, so hand it to the declared host.
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyPropertyAddressSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowThroughQueue(
          'property-addresses',
          () => queueNetlifyPropertyAddressSync(),
          { startedAt },
        )
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/addresses' : 'Failed/addresses',
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
            message: `Property addresses queued (${via === 'sync-queue' ? 'sync runner' : 'background worker'}) — End updates when the sync finishes`,
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
          message: 'Property addresses queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
      const {
        formatPropertyAddressNewCount,
        formatPropertyAddressSyncSummary,
        syncPropertyAddresses,
      } = await import('@/lib/property-address-sync')
      const result = await syncPropertyAddresses()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt: result.syncedAt,
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.totalRows,
        message: `${result.totalRows.toLocaleString()} addresses synced · ${formatPropertyAddressNewCount(result.newRows)}`,
        detail: formatPropertyAddressSyncSummary(result),
      }
    }
    case 'vision-addresses': {
      // Letter-index fill + 40 Field Cards is too long for the Admin POST
      // (those 504s). Same handoff as the Monday cron: background worker.
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyVisionAddressSync } = await import(
          '@/lib/netlify-sync-trigger'
        )
        const { queued, via } = await queueSyncNowThroughQueue(
          'vision-addresses',
          () => queueNetlifyVisionAddressSync(),
          { startedAt },
        )
        try {
          const { recordSyncRun } = await import('@/lib/db/listings-repo')
          await recordSyncRun({
            startedAt,
            finishedAt: new Date().toISOString(),
            town: '(all)',
            statusBucket: queued.ok ? 'Queued/vision' : 'Failed/vision',
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
              via === 'sync-queue'
                ? 'Vision addresses queued on the sync runner — End updates when the chunk finishes'
                : 'Vision addresses queued (background worker) — End updates when the chunk finishes',
            detail: queued.base
              ? `Queued via ${queued.base} (HTTP ${queued.status ?? '—'}). Street index fills missing letters, then missing-owner Field Cards, then the parcel walk continues.`
              : 'Queued on background worker. Street index fills missing letters, then missing-owner Field Cards, then the parcel walk continues.',
          }
        }
        return {
          ok: false,
          action,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          message: 'Vision addresses queue failed',
          detail: queued.error ?? 'Could not reach background worker',
        }
      }
      const { syncVisionAddresses } = await import('@/lib/vision-gis-sync')
      // Admin / Netlify default chunk 40 (safe). Override with VISION_SYNC_MAX_PARCELS.
      const maxRaw = Number(process.env.VISION_SYNC_MAX_PARCELS ?? '')
      const maxParcels =
        Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 200) : 40
      const result = await syncVisionAddresses({ maxParcels })
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
    case 'open-houses': {
      if (shouldQueueOnServerless(options)) {
        const { queued, via } = await queueSyncNowThroughQueue(
          'open-houses',
          // No Netlify worker for this job — it only ever ran inline, which is
          // what made the page time out. The queue is the only handoff.
          async () => ({
            ok: false,
            status: null,
            base: 'sync_queue',
            error:
              'The sync runner is not reachable, so open houses cannot be refreshed right now.',
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
            ? `Open houses queued (${via}) — End updates when the pull finishes`
            : `Open houses queue failed: ${queued.error ?? 'unknown'}`,
        }
      }
      const { syncOpenHouses } = await import('@/lib/open-houses-sync')
      const result = await syncOpenHouses()
      return {
        ok: result.ok,
        action,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs || Date.now() - t0,
        recordsFetched: result.eventsFetched,
        message: result.ok
          ? `${result.written} upcoming · ${result.historyWritten} past for ${result.window.start} → ${result.window.end}`
          : `Open house sync failed: ${result.error ?? 'unknown'}`,
        detail: result.ok
          ? `Replaced upcoming ${result.window.start}–${result.window.end} (${result.removed} removed, ${result.written} written) · upserted ${result.historyWritten} lookback${
              result.pruned > 0 ? ` · pruned ${result.pruned} older than lookback` : ''
            }`
          : result.error,
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyFomcSync } = await import('@/lib/netlify-sync-trigger')
        const { queued, via } = await queueSyncNowThroughQueue(
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
            ? `FOMC sync queued (${via})`
            : `FOMC sync queue failed (${via}): ${queued.error ?? 'unknown'}`,
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyCpiSync } = await import('@/lib/netlify-sync-trigger')
        const { queued, via } = await queueSyncNowThroughQueue(
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
            ? `CPI sync queued (${via})`
            : `CPI sync queue failed (${via}): ${queued.error ?? 'unknown'}`,
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
      if (shouldQueueOnServerless(options)) {
        const { queueNetlifyMarketDigest, isNetlifyQueueRateLimited } =
          await import('@/lib/netlify-sync-trigger')
        const first = await queueSyncNowThroughQueue(
          'market-digest',
          () =>
            queueNetlifyMarketDigest({
              source: 'admin',
              force: true,
              stampWeek: true,
            }),
          // Say so on the row rather than leaning on the child's default: an
          // operator pressing Sync now means past the slot check.
          { startedAt, payload: { force: true } },
        )
        let queued = first.queued
        let via = first.via
        // Netlify refusing background invokes site-wide (HTTP 429) is how a whole
        // week's brief went missing: the hop was declined, nothing sent, and the
        // catch-up kept re-posting the same refusal. Put it on the queue instead —
        // the slot check still blocks a double send.
        if (
          !queued.ok &&
          via === 'admin' &&
          isNetlifyQueueRateLimited(queued)
        ) {
          const { enqueueSyncJob } = await import('@/lib/sync-queue')
          const fallback = await enqueueSyncJob({
            jobId: 'market-digest',
            trigger: 'admin',
            priority: SYNC_QUEUE_PRIORITY_MANUAL,
            requestedAt: startedAt,
            ignoreCooldown: true,
          })
          if (fallback.ok) {
            queued = { ok: true, status: 202, base: 'sync_queue' }
            via = 'sync-queue'
          }
        }
        const finishedAt = new Date().toISOString()
        if (!queued.ok) {
          const reason = `worker handoff refused — ${queued.error ?? 'unknown'}`
          const { recordMarketDigestHandoffFailure } = await import(
            '@/lib/market-digest-notify'
          )
          await recordMarketDigestHandoffFailure({
            startedAt,
            trigger: `admin-${via}`,
            reason,
          })
          if (isNetlifyQueueRateLimited(queued)) {
            const { stampMarketDigestQueueBackoff } = await import(
              '@/lib/market-digest-config'
            )
            await stampMarketDigestQueueBackoff()
          }
          return {
            ok: false,
            action,
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            backgroundQueued: true,
            message: `Market brief queue failed: ${queued.error ?? 'unknown'}`,
            detail: isNetlifyQueueRateLimited(queued)
              ? 'Netlify declined the background invoke (HTTP 429). Holding off for 30 min — the sync queue skips the hop entirely once the runner is reachable.'
              : undefined,
          }
        }
        return {
          ok: true,
          action,
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          backgroundQueued: true,
          message:
            via === 'sync-queue'
              ? 'Monday market brief queued on the sync runner'
              : 'Monday market brief queued on Netlify background worker',
          detail:
            via === 'sync-queue' && first.via === 'admin'
              ? 'Netlify declined the background invoke (HTTP 429) — queued for the sync runner instead.'
              : undefined,
        }
      }
      const { sendMarketDigestEmail } = await import('@/lib/market-digest-notify')
      const force = options.force !== false
      const stampWeek = options.stampWeek !== false
      const result = await sendMarketDigestEmail({
        force,
        stampWeek,
        startedAt,
        trigger: !stampWeek
          ? 'admin-test'
          : force
            ? 'admin-sync-now'
            : 'sync-queue-sweep',
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
    const { formatPropertyAddressSyncSummary, syncPropertyAddresses } =
      await import('@/lib/property-address-sync')
    const addresses = await syncPropertyAddresses()
    return {
      message: formatPropertyAddressSyncSummary(addresses),
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

/** The later of two ISO stamps; null only when neither parses. */
function newerIso(a: string | null, b: string | null): string | null {
  const aMs = a ? Date.parse(a) : Number.NaN
  const bMs = b ? Date.parse(b) : Number.NaN
  if (!Number.isFinite(aMs)) return Number.isFinite(bMs) ? b : null
  if (!Number.isFinite(bMs)) return a
  return aMs >= bMs ? a : b
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

  // Stats cache writes its outcome twice: two loose sync_meta timestamps (the
  // rebuild's own cooldown guard) and one summary record. Only the record is
  // written by every host on every run, so Start / End / Next / Overdue read it
  // and fall back to the loose keys when they happen to be newer.
  const {
    formatStatsCacheLastRun,
    formatStatsTownQueue,
    readStatsCacheLastRun,
    readStatsTownStatuses,
    statsCacheClocks,
  } = await import('@/lib/stats-dirty-towns')
  let statsCacheLastRunStatus: string | null = null
  let statsCacheQueueStatus: string | null = null
  let statsCacheRun: StatsCacheLastRun | null = null
  try {
    const [lastRun, townStatuses] = await Promise.all([
      readStatsCacheLastRun(),
      readStatsTownStatuses(),
    ])
    statsCacheRun = lastRun
    statsCacheLastRunStatus = formatStatsCacheLastRun(lastRun)
    statsCacheQueueStatus = formatStatsTownQueue(townStatuses)
  } catch (err) {
    console.error('[admin-sync] stats cache dirty-town read failed', err)
  }
  const statsClocks = statsCacheClocks(
    statsCacheRun,
    stats.lastStatsCacheStarted,
    stats.lastStatsCache,
  )
  stats.lastStatsCacheStarted = statsClocks.startedAt
  stats.lastStatsCache = statsClocks.finishedAt
  const statsCacheLastRunError = statsClocks.failure

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

  const {
    readVisionAddressesLiveProgress,
    formatVisionAddressesLiveProgress,
  } = await import('@/lib/vision-gis-sync')
  const visionAddressesLive = readVisionAddressesLiveProgress()
  const visionAddressesLiveStatus =
    formatVisionAddressesLiveProgress(visionAddressesLive)

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
    visionAddressesLive,
    visionAddressesLiveStatus,
    statsCacheLastRunStatus,
    statsCacheQueueStatus,
    statsCacheLastRunError,
  }
}
