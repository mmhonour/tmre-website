/**
 * Backfill Closed (+ Expired) listings for specific calendar years via RETS
 * year-window pulls, then optionally rebuild stats_cache.
 *
 * Why: a single Closed pull since 2019 is oldest-first and page-capped, so
 * mid years (often 2022–2023) go missing. Active-by-month then looks too linear.
 *
 * Uses incremental upsert — does NOT delete Closed rows outside the windows.
 *
 * Usage:
 *   npm run backfill:closed-years
 *   npm run backfill:closed-years -- --years=2022,2023
 *   npm run backfill:closed-years -- --years=2022,2023 --towns=Westport,Norwalk
 *   npm run backfill:closed-years -- --years=2022,2023 --rebuild-stats
 */
import { upsertListingsIncremental, recordSyncRun } from '../lib/db/listings-repo'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import {
  fetchClosedListingsForTownYearWindows,
  fetchExpiredListingsForTownYearWindows,
} from '../lib/closed-listings-rets'
import { isRetsConfigured, retsSyncBlockedMessage } from '../lib/rets'
import { TMRE_TOWNS, isTmreTown, type TmreTown } from '../lib/tmre-towns'

function parseArgs(argv: string[]) {
  let years = [2022, 2023]
  let towns: TmreTown[] = [...TMRE_TOWNS]
  let rebuildStats = false

  for (const arg of argv) {
    if (arg === '--rebuild-stats') {
      rebuildStats = true
      continue
    }
    if (arg.startsWith('--years=')) {
      years = arg
        .slice('--years='.length)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 2000 && n <= 2100)
      continue
    }
    if (arg.startsWith('--towns=')) {
      towns = arg
        .slice('--towns='.length)
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is TmreTown => isTmreTown(s))
    }
  }

  if (years.length === 0) years = [2022, 2023]
  if (towns.length === 0) towns = [...TMRE_TOWNS]
  return { years, towns, rebuildStats }
}

async function main() {
  const { years, towns, rebuildStats } = parseArgs(process.argv.slice(2))
  console.log(
    `[backfill:closed-years] towns=${towns.join(', ')} years=${years.join(', ')} rebuildStats=${rebuildStats}`,
  )

  if (!isRetsConfigured()) {
    throw new Error(retsSyncBlockedMessage())
  }

  await hydrateSyncMetaStore()

  for (const town of towns) {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    console.log(`\n[backfill:closed-years] ${town} Closed…`)
    const closed = await fetchClosedListingsForTownYearWindows(town, {
      years,
      parallel: false,
    })
    const closedUpsert = await upsertListingsIncremental(town, 'Closed', closed)
    console.log(
      `[backfill:closed-years] ${town} Closed upserted=${closedUpsert.count} (ins=${closedUpsert.inserted} upd=${closedUpsert.updated}, fetched ${closed.length})`,
    )
    await recordSyncRun({
      startedAt,
      finishedAt: new Date().toISOString(),
      town,
      statusBucket: 'Closed/year-backfill',
      listingsCount: closed.length,
      ok: true,
      error: `years ${years.join(',')} · upserted ${closedUpsert.count}`,
    })

    const expStarted = new Date().toISOString()
    console.log(`[backfill:closed-years] ${town} Expired…`)
    const expired = await fetchExpiredListingsForTownYearWindows(town, {
      years,
      parallel: false,
    })
    const expiredUpsert = await upsertListingsIncremental(
      town,
      'Expired',
      expired,
    )
    console.log(
      `[backfill:closed-years] ${town} Expired upserted=${expiredUpsert.count} (ins=${expiredUpsert.inserted} upd=${expiredUpsert.updated}, fetched ${expired.length}) in ${Date.now() - t0}ms`,
    )
    await recordSyncRun({
      startedAt: expStarted,
      finishedAt: new Date().toISOString(),
      town,
      statusBucket: 'Expired/year-backfill',
      listingsCount: expired.length,
      ok: true,
      error: `years ${years.join(',')} · upserted ${expiredUpsert.count}`,
    })
  }

  if (rebuildStats) {
    console.log('\n[backfill:closed-years] rebuildStatsCache…')
    const { rebuildStatsCache } = await import('../lib/stats-cache')
    const result = await rebuildStatsCache({ trackRefresh: true, force: true })
    console.log(
      `[backfill:closed-years] stats written=${result.written} skipped=${result.skipped ?? false} reason=${result.skipReason ?? '—'}`,
    )
  } else {
    console.log(
      '\n[backfill:closed-years] Done. Rebuild stats cache (Admin → Stats cache, or re-run with --rebuild-stats) so Active-by-month updates.',
    )
  }
}

main().catch((err) => {
  console.error('[backfill:closed-years] FAILED:', err)
  process.exitCode = 1
})
