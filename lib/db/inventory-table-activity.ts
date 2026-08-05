import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'

/**
 * Preferred write/activity clocks, first match wins per table.
 * Keep in sync with Admin Inventory “Last updated” / sample ORDER BY.
 */
const TIMESTAMP_CANDIDATES = [
  'synced_at',
  'updated_at',
  'finished_at',
  'started_at',
  'modification_timestamp',
  'computed_at',
  'fetched_at',
  'applied_at',
  'verified_at',
  'last_seen',
  'created_at',
] as const

const TIMESTAMP_DATA_TYPES = [
  'timestamp with time zone',
  'timestamp without time zone',
  'date',
] as const

const SAMPLE_ROW_LIMIT = 100
const RECENT_WINDOW_SQL = `now() - interval '60 minutes'`

export type TableActivity = {
  table: string
  /** Column used for 60m count + last updated, or null when none exists. */
  timestampColumn: string | null
  upsertedLast60m: number | null
  lastUpdated: string | null
}

export type TableSampleOrder = {
  column: string
  /** Always newest-first for Admin sample rows. */
  direction: 'desc'
  /** How the column was chosen. */
  source: 'preferred' | 'timestamp' | 'identity'
}

export type TableSamplePayload = {
  table: string
  /** @deprecated Prefer orderBy.column — kept for existing Admin clients. */
  timestampColumn: string | null
  orderBy: TableSampleOrder | null
  columns: string[]
  rows: Record<string, unknown>[]
  limit: number
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`)
  }
  return `"${name}"`
}

async function listPublicTables(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  )
  return rows.map((r) => r.name)
}

type ColumnMeta = {
  column_name: string
  data_type: string
  is_identity: string
  udt_name: string
}

async function readTableColumnMeta(table: string): Promise<ColumnMeta[]> {
  return query<ColumnMeta>(
    `SELECT column_name, data_type, is_identity, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  )
}

function isTimestampType(col: ColumnMeta): boolean {
  return (TIMESTAMP_DATA_TYPES as readonly string[]).includes(col.data_type)
}

/** Prefer named clocks, then any timestamptz/date column on the table. */
function pickTimestampColumn(columns: readonly ColumnMeta[]): {
  column: string
  source: 'preferred' | 'timestamp'
} | null {
  const byName = new Map(columns.map((c) => [c.column_name, c]))
  for (const candidate of TIMESTAMP_CANDIDATES) {
    const col = byName.get(candidate)
    if (col && isTimestampType(col)) {
      return { column: candidate, source: 'preferred' }
    }
  }
  // Any remaining timestamp-like column (name hint first, then ordinal).
  const timestamps = columns.filter(isTimestampType)
  if (timestamps.length === 0) return null
  const hinted = timestamps.find((c) =>
    /(_at|time|date|stamp)$/i.test(c.column_name),
  )
  const pick = hinted ?? timestamps[0]!
  return { column: pick.column_name, source: 'timestamp' }
}

async function resolveTimestampColumn(table: string): Promise<string | null> {
  const meta = await readTableColumnMeta(table)
  return pickTimestampColumn(meta)?.column ?? null
}

/** ORDER BY for sample rows: timestamp clock, else identity PK. */
async function resolveSampleOrder(
  table: string,
): Promise<TableSampleOrder | null> {
  const meta = await readTableColumnMeta(table)
  const ts = pickTimestampColumn(meta)
  if (ts) {
    return { column: ts.column, direction: 'desc', source: ts.source }
  }
  // Prefer GENERATED identity; otherwise a numeric `id` column if present.
  const identityYes = meta.find((c) => c.is_identity === 'YES')
  if (identityYes) {
    return {
      column: identityYes.column_name,
      direction: 'desc',
      source: 'identity',
    }
  }
  const idCol = meta.find(
    (c) =>
      c.column_name === 'id' &&
      (c.udt_name === 'int4' || c.udt_name === 'int8'),
  )
  if (idCol) {
    return { column: 'id', direction: 'desc', source: 'identity' }
  }
  return null
}

async function readTimestampColumnsByTable(
  tables: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (const table of tables) out.set(table, null)
  if (tables.length === 0) return out

  const rows = await query<{
    table_name: string
    column_name: string
    data_type: string
  }>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
        AND (
          column_name = ANY($2::text[])
          OR data_type = ANY($3::text[])
        )`,
    [tables, [...TIMESTAMP_CANDIDATES], [...TIMESTAMP_DATA_TYPES]],
  )

  const byTable = new Map<string, ColumnMeta[]>()
  for (const row of rows) {
    const list = byTable.get(row.table_name) ?? []
    list.push({
      column_name: row.column_name,
      data_type: row.data_type,
      is_identity: 'NO',
      udt_name: '',
    })
    byTable.set(row.table_name, list)
  }

  for (const table of tables) {
    const pick = pickTimestampColumn(byTable.get(table) ?? [])
    out.set(table, pick?.column ?? null)
  }
  return out
}

async function assertPublicTable(table: string): Promise<string> {
  const name = table.trim()
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error('Invalid table name')
  }
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = $1`,
    [name],
  )
  if (!row) throw new Error(`Unknown public table: ${name}`)
  return name
}

/** Soft cap so 100× listings.raw cannot blow the Admin JSON response. */
const SAMPLE_CELL_MAX_CHARS = 64_000

function cellValue(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const text = value.toString('utf8')
    return text.length > SAMPLE_CELL_MAX_CHARS
      ? `${text.slice(0, SAMPLE_CELL_MAX_CHARS)}…[truncated ${text.length.toLocaleString()} chars]`
      : text
  }
  if (typeof value === 'string') {
    return value.length > SAMPLE_CELL_MAX_CHARS
      ? `${value.slice(0, SAMPLE_CELL_MAX_CHARS)}…[truncated ${value.length.toLocaleString()} chars]`
      : value
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      if (json.length > SAMPLE_CELL_MAX_CHARS) {
        return `${json.slice(0, SAMPLE_CELL_MAX_CHARS)}…[truncated ${json.length.toLocaleString()} chars]`
      }
      return JSON.parse(json) as unknown
    } catch {
      return String(value)
    }
  }
  return value
}

/** Normalize pg Date / timestamptz text → ISO for Admin UI Date.parse. */
export function timestampToIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const direct = Date.parse(trimmed)
  if (!Number.isNaN(direct)) return new Date(direct).toISOString()
  // Postgres often renders timestamptz as "2026-08-04 19:40:58.123+00"
  const spaced = trimmed.includes('T')
    ? trimmed
    : trimmed.replace(' ', 'T')
  const withColonTz = spaced.replace(/([+-]\d{2})$/, '$1:00')
  for (const candidate of [spaced, withColonTz, `${spaced}Z`]) {
    const ms = Date.parse(candidate)
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }
  return null
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  const n = Math.min(Math.max(concurrency, 1), items.length || 1)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

/** Per-table upsert window + newest timestamp for Admin Database inventory. */
export async function readAllTableActivity(): Promise<Record<string, TableActivity>> {
  const tables = await listPublicTables()
  const tsByTable = await readTimestampColumnsByTable(tables)
  const out: Record<string, TableActivity> = {}

  await mapPool(tables, 4, async (table) => {
    try {
      const tsCol = tsByTable.get(table) ?? null
      if (!tsCol) {
        out[table] = {
          table,
          timestampColumn: null,
          upsertedLast60m: null,
          lastUpdated: null,
        }
        return
      }
      const qTable = quoteIdent(table)
      const qCol = quoteIdent(tsCol)
      // Return timestamptz as a Date (node-pg) — ::text breaks Admin Date.parse.
      const row = await queryOne<{
        recent: number
        last_updated: Date | string | null
      }>(
        `SELECT COUNT(*) FILTER (WHERE ${qCol} >= ${RECENT_WINDOW_SQL})::int AS recent,
                MAX(${qCol}) AS last_updated
           FROM ${qTable}`,
      )
      out[table] = {
        table,
        timestampColumn: tsCol,
        upsertedLast60m: row?.recent ?? 0,
        lastUpdated: timestampToIso(row?.last_updated ?? null),
      }
    } catch (err) {
      console.warn(
        `[inventory-table-activity] ${table} failed`,
        err instanceof Error ? err.message : err,
      )
      out[table] = {
        table,
        timestampColumn: null,
        upsertedLast60m: null,
        lastUpdated: null,
      }
    }
  })

  return out
}

function sampleSortMs(value: unknown): number {
  if (value == null) return Number.NEGATIVE_INFINITY
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
  }
  if (typeof value === 'string') {
    const asNum = Number(value)
    if (Number.isFinite(asNum) && value.trim() !== '') return asNum
    const iso = timestampToIso(value)
    if (iso) return Date.parse(iso)
  }
  return Number.NEGATIVE_INFINITY
}

/** Newest ~100 rows for one public table (on-demand Admin expand). */
export async function readTableSampleRows(
  tableName: string,
  limit = SAMPLE_ROW_LIMIT,
): Promise<TableSamplePayload> {
  const table = await assertPublicTable(tableName)
  const cap = Math.min(Math.max(limit, 1), SAMPLE_ROW_LIMIT)
  const orderBy = await resolveSampleOrder(table)
  const qTable = quoteIdent(table)
  const orderSql = orderBy
    ? `ORDER BY ${quoteIdent(orderBy.column)} DESC NULLS LAST`
    : ''

  // All public columns in schema order (SELECT *), including nulls.
  const columns = (await readTableColumnMeta(table)).map((c) => c.column_name)

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${qTable} ${orderSql} LIMIT ${cap}`,
  )

  const mapped = rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const col of columns) {
      out[col] = cellValue(row[col])
    }
    return out
  })

  // Belt-and-suspenders: keep newest-first even if the driver reshuffles.
  if (orderBy) {
    const col = orderBy.column
    mapped.sort((a, b) => sampleSortMs(b[col]) - sampleSortMs(a[col]))
  }

  return {
    table,
    timestampColumn:
      orderBy && orderBy.source !== 'identity' ? orderBy.column : null,
    orderBy,
    columns,
    rows: mapped,
    limit: cap,
  }
}
