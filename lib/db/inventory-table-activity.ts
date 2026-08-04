import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'

/** Preferred write/activity clocks, first match wins per table. */
const TIMESTAMP_CANDIDATES = [
  'synced_at',
  'updated_at',
  'finished_at',
  'modification_timestamp',
  'created_at',
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

export type TableSamplePayload = {
  table: string
  timestampColumn: string | null
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

async function resolveTimestampColumn(table: string): Promise<string | null> {
  const byTable = await readTimestampColumnsByTable([table])
  return byTable.get(table) ?? null
}

async function readTimestampColumnsByTable(
  tables: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (const table of tables) out.set(table, null)
  if (tables.length === 0) return out

  const rows = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
        AND column_name = ANY($2::text[])`,
    [tables, [...TIMESTAMP_CANDIDATES]],
  )

  const present = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = present.get(row.table_name) ?? new Set<string>()
    set.add(row.column_name)
    present.set(row.table_name, set)
  }

  for (const table of tables) {
    const cols = present.get(table)
    if (!cols) continue
    for (const candidate of TIMESTAMP_CANDIDATES) {
      if (cols.has(candidate)) {
        out.set(table, candidate)
        break
      }
    }
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

function cellValue(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 240)}…` : value
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      return json.length > 240 ? `${json.slice(0, 240)}…` : JSON.parse(json)
    } catch {
      return String(value)
    }
  }
  return value
}

/** Per-table upsert window + newest timestamp for Admin Database inventory. */
export async function readAllTableActivity(): Promise<Record<string, TableActivity>> {
  const tables = await listPublicTables()
  const tsByTable = await readTimestampColumnsByTable(tables)
  const out: Record<string, TableActivity> = {}

  await Promise.all(
    tables.map(async (table) => {
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
        const row = await queryOne<{ recent: number; last_updated: string | null }>(
          `SELECT COUNT(*) FILTER (WHERE ${qCol} >= ${RECENT_WINDOW_SQL})::int AS recent,
                  MAX(${qCol})::text AS last_updated
             FROM ${qTable}`,
        )
        out[table] = {
          table,
          timestampColumn: tsCol,
          upsertedLast60m: row?.recent ?? 0,
          lastUpdated: row?.last_updated ?? null,
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
    }),
  )

  return out
}

/** Newest ~100 rows for one public table (on-demand Admin expand). */
export async function readTableSampleRows(
  tableName: string,
  limit = SAMPLE_ROW_LIMIT,
): Promise<TableSamplePayload> {
  const table = await assertPublicTable(tableName)
  const cap = Math.min(Math.max(limit, 1), SAMPLE_ROW_LIMIT)
  const tsCol = await resolveTimestampColumn(table)
  const qTable = quoteIdent(table)
  const order = tsCol
    ? `ORDER BY ${quoteIdent(tsCol)} DESC NULLS LAST`
    : ''

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${qTable} ${order} LIMIT ${cap}`,
  )

  const columns =
    rows.length > 0
      ? Object.keys(rows[0])
      : (
          await query<{ column_name: string }>(
            `SELECT column_name
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1
              ORDER BY ordinal_position`,
            [table],
          )
        ).map((r) => r.column_name)

  return {
    table,
    timestampColumn: tsCol,
    columns,
    rows: rows.map((row) => {
      const out: Record<string, unknown> = {}
      for (const col of columns) {
        out[col] = cellValue(row[col])
      }
      return out
    }),
    limit: cap,
  }
}
