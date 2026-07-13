import type { TownSyncResult } from '@/lib/listings-sync'
import type { TableWriteStats } from '@/lib/sqlite-sync-stats'
import { FULL_RESYNC_FINALIZE_STEP_LABELS, type FullResyncFinalizeStepId } from '@/lib/admin-sync-types'

/** One-line bucket counts, e.g. "Active 234 · Closed 1,892 · Expired 12 (2,138 fetched)". */
export function formatTownSyncBreakdown(results: TownSyncResult[]): string {
  if (results.length === 0) return 'No records fetched'
  const parts = results.map((row) => `${row.statusBucket} ${row.count.toLocaleString()}`)
  const total = results.reduce((sum, row) => sum + row.count, 0)
  return `${parts.join(' · ')} (${total.toLocaleString()} fetched)`
}

/** Cumulative full-resync progress after a town finishes. */
export function formatFullResyncTownProgress(options: {
  town: string
  townIndex: number
  townCount: number
  townResults: TownSyncResult[]
  sqliteTotal: number | null
}): string {
  const { town, townIndex, townCount, townResults, sqliteTotal } = options
  const breakdown = formatTownSyncBreakdown(townResults)
  const runningTotal =
    sqliteTotal != null ? ` · ${sqliteTotal.toLocaleString()} listings now in Postgres` : ''
  return `Town ${townIndex}/${townCount} ${town}: ${breakdown}${runningTotal}`
}

/** While a town step is in flight. */
export function formatFullResyncTownPending(options: {
  town: string
  townIndex: number
  townCount: number
  sqliteTotal: number | null
  completedTowns?: readonly string[]
}): string {
  const { town, townIndex, townCount, sqliteTotal, completedTowns } = options
  const loaded = sqliteTotal ?? 0
  const doneCount = completedTowns?.length ?? Math.max(0, townIndex - 1)
  const runningTotal =
    doneCount > 0
      ? ` · ${loaded.toLocaleString()} listings loaded from ${doneCount} town${doneCount === 1 ? '' : 's'}${
          completedTowns && completedTowns.length > 0 ? ` (${completedTowns.join(', ')})` : ''
        }`
      : ' · first town, nothing loaded yet'
  return `Fetching ${town} from MLS — Active + Closed + Expired… town ${townIndex}/${townCount}${runningTotal}`
}

/** While a chunked full-resync finalize step is in flight. */
export function formatFullResyncFinalizeStepPending(options: {
  stepId: FullResyncFinalizeStepId
  stepIndex: number
  stepCount: number
}): string {
  const { stepId, stepIndex, stepCount } = options
  const label = FULL_RESYNC_FINALIZE_STEP_LABELS[stepId] ?? stepId
  return `Finalizing full resync — ${label}… step ${stepIndex}/${stepCount}`
}

/** After a chunked full-resync finalize step completes (not yet the last one). */
export function formatFullResyncFinalizeStepDetail(options: {
  stepId: FullResyncFinalizeStepId
  stepIndex: number
  stepCount: number
}): string {
  const { stepId, stepIndex, stepCount } = options
  const label = FULL_RESYNC_FINALIZE_STEP_LABELS[stepId] ?? stepId
  return `Finalize step ${stepIndex}/${stepCount} complete — ${label} rebuilt`
}

/** Compact per-table row counts for admin Description column. */
export function formatTableStatsSummary(tables: TableWriteStats[]): string {
  if (tables.length === 0) return 'No table rows yet'
  return tables.map((row) => `${row.table} ${row.queried.toLocaleString()}`).join(' · ')
}

/** One-line inventory for listings / listings.read / listing-photos rows. */
export function formatAdminDatabaseTableSummary(
  tables: { table: string; rowCount: number; approximate?: boolean }[],
  options?: { schemaOnly?: boolean },
): string {
  if (tables.length === 0) {
    return options?.schemaOnly
      ? 'Schema only (0 rows) — run Full resync'
      : 'No tables with data'
  }
  const line = tables
    .map((row) => {
      const prefix = row.approximate ? '≈' : ''
      return `${row.table} ${prefix}${row.rowCount.toLocaleString()}`
    })
    .join(' · ')
  return options?.schemaOnly ? `${line} — run Full resync to populate` : line
}

function formatBucketSummary(byBucket: Record<string, number>): string {
  const order = ['Active', 'Closed', 'Expired']
  const parts = order
    .filter((bucket) => (byBucket[bucket] ?? 0) > 0)
    .map((bucket) => `${bucket} ${byBucket[bucket]!.toLocaleString()}`)
  for (const [bucket, count] of Object.entries(byBucket)) {
    if (order.includes(bucket) || count <= 0) continue
    parts.push(`${bucket} ${count.toLocaleString()}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '0 rows'
}

/** Final full-resync detail with per-table SQLite counts. */
export function formatFullResyncCompleteDetail(options: {
  listingTotal: number
  byBucket?: Record<string, number>
  fetchedTotal?: number
  tables: TableWriteStats[]
}): string {
  const { listingTotal, byBucket, fetchedTotal, tables } = options
  const lines: string[] = []

  const bucketLine =
    byBucket && Object.keys(byBucket).length > 0
      ? formatBucketSummary(byBucket)
      : null
  const fetchedSuffix =
    fetchedTotal != null && fetchedTotal > 0 && fetchedTotal !== listingTotal
      ? ` (${fetchedTotal.toLocaleString()} fetched from MLS this run)`
      : ''

  lines.push(
    bucketLine
      ? `listings ${listingTotal.toLocaleString()} — ${bucketLine}${fetchedSuffix}`
      : `listings ${listingTotal.toLocaleString()}${fetchedSuffix}`,
  )

  const otherTables = tables.filter((row) => row.table !== 'listings')
  if (otherTables.length > 0) {
    lines.push(formatTableStatsSummary(otherTables))
  }

  lines.push(
    'Rebuilt scores, stats, Deal of the Day, and intelligence board caches',
  )
  return lines.join(' — ')
}

/** Town-step detail with per-table counts on the write DB. */
export function formatFullResyncTownProgressWithTables(options: {
  town: string
  townIndex: number
  townCount: number
  townResults: TownSyncResult[]
  sqliteTotal: number | null
  tables: TableWriteStats[]
}): string {
  const base = formatFullResyncTownProgress(options)
  const tableSummary = formatTableStatsSummary(options.tables)
  return tableSummary === 'No table rows yet' ? base : `${base} — ${tableSummary}`
}

/** Incremental / multi-town summary. */
export function formatTownSyncSummary(towns: TownSyncResult[], totalLabel = 'upserts'): string {
  if (towns.length === 0) return 'No town results'
  const total = towns.reduce((sum, row) => sum + row.count, 0)
  const withData = towns.filter((row) => row.count > 0)
  const sample =
    withData.length > 0
      ? withData
          .slice(0, 4)
          .map((row) => `${row.town} ${row.count.toLocaleString()}`)
          .join(' · ')
      : towns
          .slice(0, 4)
          .map((row) => `${row.town} 0`)
          .join(' · ')
  const suffix = withData.length > 4 ? ` · +${withData.length - 4} more towns` : ''
  return `${total.toLocaleString()} ${totalLabel} — ${sample}${suffix}`
}
