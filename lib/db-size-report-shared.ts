/**
 * Pure helpers for the Neon size + growth report. Kept off `server-only` so
 * unit tests and the CLI formatter can import them without a database.
 */

import { formatBytes } from '@/lib/sqlite-schema-diagram-types'

export const GB = 1024 ** 3
export const STORAGE_USD_PER_GB_MONTH = 0.35
export const LAUNCH_CU_HOUR_USD = 0.106
export const SCALE_CU_HOUR_USD = 0.222
export const HOURS_PER_MONTH = 730

/** Column that best marks "this row was born", most authoritative first. */
export const BIRTH_COLUMNS = [
  'created_at',
  'first_seen',
  'first_viewed_at',
  'observed_at',
  'requested_at',
  'started_at',
  'scraped_at',
  'verified_at',
  'applied_at',
  'list_date',
  'synced_at',
  'computed_at',
] as const

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`)
  }
  return `"${name}"`
}

export function storageMonthlyUsd(bytes: number): number {
  return (bytes / GB) * STORAGE_USD_PER_GB_MONTH
}

export function alwaysOnMonthlyUsd(cu: number, rateUsd: number): number {
  return HOURS_PER_MONTH * cu * rateUsd
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export type DbSizeTable = {
  table: string
  rows: number
  total: number
  heap: number
  toast: number
  indexes: number
  totalLabel: string
  heapLabel: string
  toastLabel: string
  indexLabel: string
}

export type DbSizeListings = {
  total: number
  active: number
  closed: number
  listed1d: number
  listed7d: number
  listed30d: number
  closed1d: number
  closed7d: number
  closed30d: number
  listedPerDay: number
  closedPerDay: number
}

export type DbSizeGrowthRow = {
  table: string
  column: string
  total: number
  nulls: number
  d1: number
  d7: number
  d30: number
  oldest: string | null
  newest: string | null
  perDay: number
  bytesPerDay: number
  bytesPerDayLabel: string
  sparsePct: number | null
}

export type DbSizeChatterRow = {
  calls: number
  rows: number
  totalMs: number
  query: string
  callsPerDay: number | null
  everyLabel: string
}

export type DbSizeAlwaysOnCost = {
  cu: number
  launchUsd: number
  scaleUsd: number
}

export type DbSizeReport = {
  fetchedAt: string
  database: string
  totalBytes: number
  totalLabel: string
  storageMonthlyUsd: number
  storageMonthlyLabel: string
  tables: DbSizeTable[]
  tableRollup: DbSizeTableRollup
  listings: DbSizeListings | null
  growth: DbSizeGrowthRow[]
  growthRollup: DbSizeGrowthRollup
  growthBytesPerDay: number
  growthBytesPerDayLabel: string
  growthBytesPerMonthLabel: string
  growthGbPerYear: number
  growthStorageAfterYearUsd: number
  sparseNotes: string[]
  chatter: {
    uptimeSeconds: number
    hoursAwake: number
    canExtrapolate: boolean
    rows: DbSizeChatterRow[]
    alwaysOn: DbSizeAlwaysOnCost[]
  } | null
  chatterUnavailable: boolean
}

export type DbSizeTableRollup = {
  rows: number
  total: number
  heap: number
  toast: number
  indexes: number
  rowsLabel: string
  totalLabel: string
  heapLabel: string
  toastLabel: string
  indexLabel: string
}

export type DbSizeGrowthRollup = {
  d1: number
  d7: number
  d30: number
  perDay: number
  bytesPerDay: number
  d1Label: string
  d7Label: string
  d30Label: string
  perDayLabel: string
  bytesPerDayLabel: string
}

function formatCountLabel(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

export function rollupTableSizes(tables: readonly DbSizeTable[]): DbSizeTableRollup {
  const rows = tables.reduce((sum, row) => sum + row.rows, 0)
  const total = tables.reduce((sum, row) => sum + row.total, 0)
  const heap = tables.reduce((sum, row) => sum + row.heap, 0)
  const toast = tables.reduce((sum, row) => sum + row.toast, 0)
  const indexes = tables.reduce((sum, row) => sum + row.indexes, 0)
  return {
    rows,
    total,
    heap,
    toast,
    indexes,
    rowsLabel: formatCountLabel(rows),
    totalLabel: formatBytes(total),
    heapLabel: formatBytes(heap),
    toastLabel: formatBytes(toast),
    indexLabel: formatBytes(indexes),
  }
}

export function rollupGrowthRows(
  growth: readonly DbSizeGrowthRow[],
): DbSizeGrowthRollup {
  const d1 = growth.reduce((sum, row) => sum + row.d1, 0)
  const d7 = growth.reduce((sum, row) => sum + row.d7, 0)
  const d30 = growth.reduce((sum, row) => sum + row.d30, 0)
  const perDay = growth.reduce((sum, row) => sum + row.perDay, 0)
  const bytesPerDay = growth.reduce((sum, row) => sum + row.bytesPerDay, 0)
  return {
    d1,
    d7,
    d30,
    perDay,
    bytesPerDay,
    d1Label: formatCountLabel(d1),
    d7Label: formatCountLabel(d7),
    d30Label: formatCountLabel(d30),
    perDayLabel: formatCountLabel(perDay),
    bytesPerDayLabel: formatBytes(bytesPerDay),
  }
}

export function decorateTableSize(input: {
  table: string
  rows: number
  total: number
  heap: number
  toast: number
  indexes: number
}): DbSizeTable {
  return {
    ...input,
    totalLabel: formatBytes(input.total),
    heapLabel: formatBytes(input.heap),
    toastLabel: formatBytes(input.toast),
    indexLabel: formatBytes(input.indexes),
  }
}

export function decorateGrowthRow(input: {
  table: string
  column: string
  total: number
  nulls: number
  d1: number
  d7: number
  d30: number
  oldest: string | null
  newest: string | null
  tableBytes: number
}): DbSizeGrowthRow {
  const bytesPerRow = input.tableBytes / Math.max(1, input.total)
  const perDay = input.d30 / 30
  const bytesPerDay = perDay * bytesPerRow
  const sparsePct =
    input.total > 0 && input.nulls / input.total > 0.2
      ? Math.round((input.nulls / input.total) * 100)
      : null
  return {
    table: input.table,
    column: input.column,
    total: input.total,
    nulls: input.nulls,
    d1: input.d1,
    d7: input.d7,
    d30: input.d30,
    oldest: input.oldest,
    newest: input.newest,
    perDay,
    bytesPerDay,
    bytesPerDayLabel: formatBytes(bytesPerDay),
    sparsePct,
  }
}

export function decorateChatterRow(
  input: { calls: number; rows: number; totalMs: number; query: string },
  uptimeSeconds: number,
  canExtrapolate: boolean,
): DbSizeChatterRow {
  const hours = uptimeSeconds / 3600
  const gap =
    input.calls > 0 && uptimeSeconds > 0 ? uptimeSeconds / input.calls : Infinity
  const everyLabel =
    canExtrapolate && Number.isFinite(gap)
      ? gap < 90
        ? `${gap.toFixed(1)}s`
        : `${(gap / 60).toFixed(1)}m`
      : '—'
  return {
    ...input,
    callsPerDay: canExtrapolate ? Math.round((input.calls / hours) * 24) : null,
    everyLabel,
  }
}

export function alwaysOnCosts(): DbSizeAlwaysOnCost[] {
  return [1, 2, 4].map((cu) => ({
    cu,
    launchUsd: alwaysOnMonthlyUsd(cu, LAUNCH_CU_HOUR_USD),
    scaleUsd: alwaysOnMonthlyUsd(cu, SCALE_CU_HOUR_USD),
  }))
}
