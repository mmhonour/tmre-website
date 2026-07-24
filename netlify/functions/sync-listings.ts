import type { Config } from '@netlify/functions'
import { recordSyncRun } from '../../lib/db/listings-repo'
import { hydrateSyncMetaStore } from '../../lib/db/sync-meta-store'
import { getSyncStatus, syncIncrementalListings } from '../../lib/listings-sync'
import { runOverdueSyncCatchup } from '../../lib/sync-overdue'
import { isScheduledSyncJobPausedFresh } from '../../lib/scheduled-sync-toggle'

/**
 * Record every Netlify cron tick to Postgres `sync_runs` so Admin can see
 * firings even when the work was skipped (paused / no RETS / lock).
 */
async function recordIncrementalCronTick(input: {
  startedAt: string
  ok: boolean
  listingsCount?: number
  error?: string | null
  skipped?: boolean
}): Promise<void> {
  const finishedAt = new Date().toISOString()
  try {
    await recordSyncRun({
      startedAt: input.startedAt,
      finishedAt,
      town: '(cron)',
      statusBucket: 'cron/incremental',
      listingsCount: input.listingsCount ?? 0,
      ok: input.ok,
      error:
        input.error ??
        (input.skipped ? 'skipped' : null),
    })
  } catch (err) {
    console.warn('[netlify/sync-listings] cron tick log failed', err)
  }
}

export default async function handler() {
  process.env.NETLIFY_SYNC_HANDLER = '1'
  const startedAt = new Date().toISOString()

  try {
    // Cron Lambdas are cold — hydrate sync_meta before watermark / pause / lock reads.
    await hydrateSyncMetaStore()

    const catchup = await runOverdueSyncCatchup({ reason: 'netlify/sync-listings' })
    if (await isScheduledSyncJobPausedFresh('incremental')) {
      await recordIncrementalCronTick({
        startedAt,
        ok: true,
        skipped: true,
        error: 'incremental scheduled sync paused by admin',
      })
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'incremental scheduled sync paused by admin',
          overdueCatchup: catchup.skipped
            ? { skipped: true, reason: catchup.reason }
            : { skipped: false, plan: catchup.plan, steps: catchup.steps },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await syncIncrementalListings()
    const skippedEmpty =
      result.towns.length === 0 && result.durationMs === 0
    await recordIncrementalCronTick({
      startedAt: result.startedAt || startedAt,
      ok: skippedEmpty
        ? true
        : result.towns.every((row) => row.ok),
      listingsCount: result.totalUpserted,
      skipped: skippedEmpty,
      error: skippedEmpty
        ? 'no town work (RETS missing, refresh lock, or empty tick)'
        : result.towns
            .filter((row) => !row.ok)
            .map((row) => `${row.town}: ${row.error ?? 'failed'}`)
            .join('; ') || null,
    })
    // Refresh only the spotlight listings' status (incl. off-market states the
    // Active-only incremental never revisits) so Postgres stays truthful.
    try {
      const { refreshSpotlightStatuses } = await import('../../lib/spotlight-status-sync')
      await refreshSpotlightStatuses()
    } catch (err) {
      console.warn('[netlify/sync-listings] spotlight status refresh failed', err)
    }
    // Visitor saved-search alerts (email): immediate + due daily/weekly digests.
    let savedSearchAlerts: { checked: number; sent: number; listings: number } | null =
      null
    try {
      const { processDueSavedSearchAlerts } = await import(
        '../../lib/saved-search-alerts'
      )
      savedSearchAlerts = await processDueSavedSearchAlerts()
    } catch (err) {
      console.warn('[netlify/sync-listings] saved-search alerts failed', err)
    }
    return new Response(
      JSON.stringify({
        ok: result.towns.length === 0 || result.towns.every((row) => row.ok),
        ...result,
        savedSearchAlerts,
        stats: await getSyncStatus(),
        overdueCatchup: catchup.skipped
          ? { skipped: true, reason: catchup.reason }
          : { skipped: false, plan: catchup.plan, steps: catchup.steps },
      }),
      {
        status:
          result.towns.length === 0 || result.towns.every((row) => row.ok)
            ? 200
            : 502,
        headers: { 'content-type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[netlify/sync-listings]', err)
    await recordIncrementalCronTick({
      startedAt,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const config: Config = {
  // Literal schedule so Netlify reliably detects Scheduled Functions.
  // Incremental RETS → Postgres every 30 minutes (UTC). Full reload is weekly
  // (sync-listings-full Monday ~5am ET).
  schedule: '*/30 * * * *',
  background: true,
}
