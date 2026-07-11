import type { TownSyncResult } from '@/lib/listings-sync'

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
  const sqlite =
    sqliteTotal != null ? ` · ${sqliteTotal.toLocaleString()} listings now in SQLite` : ''
  return `Town ${townIndex}/${townCount} ${town}: ${breakdown}${sqlite}`
}

/** While a town step is in flight. */
export function formatFullResyncTownPending(options: {
  town: string
  townIndex: number
  townCount: number
  sqliteTotal: number | null
}): string {
  const { town, townIndex, townCount, sqliteTotal } = options
  const sqlite =
    sqliteTotal != null && sqliteTotal > 0
      ? ` · ${sqliteTotal.toLocaleString()} listings loaded so far`
      : ''
  return `Fetching ${town} from MLS (Active, Closed, Expired)… step ${townIndex}/${townCount}${sqlite}`
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
