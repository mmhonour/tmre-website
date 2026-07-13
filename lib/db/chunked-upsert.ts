import 'server-only'

import type { PoolClient } from 'pg'
import { withTransaction } from '@/lib/db/postgres'

/**
 * Chunked multi-row upsert helper.
 *
 * Postgres inventory/derived writes used to run one `INSERT ... ON CONFLICT` per
 * row. Against in-process SQLite that was free; against network-bound Neon each
 * row is a separate round-trip (~30-80ms), so a town of 2,500 rows (× listings +
 * tax history) meant thousands of sequential round-trips = minutes per town.
 *
 * This helper collapses those into a handful of multi-row `INSERT ... VALUES
 * (...),(...),... ON CONFLICT` statements. Callers pass ordered rows and the
 * conflict key; batch size (rows per statement) is Admin-tunable and is always
 * auto-capped so a single statement never exceeds Postgres's bind-param limit.
 */

export type ChunkedUpsertColumn = {
  name: string
  /** Optional cast suffix for the placeholder, e.g. "jsonb" → `$n::jsonb`. */
  cast?: string
}

/** Postgres hard cap is 65535 bind params per statement; stay well under it. */
const MAX_BIND_PARAMS = 60000

/** Largest rows-per-statement that keeps a batch under the bind-param cap. */
export function maxRowsForColumns(columnCount: number): number {
  return Math.max(1, Math.floor(MAX_BIND_PARAMS / Math.max(1, columnCount)))
}

export async function chunkedUpsert(options: {
  table: string
  columns: ChunkedUpsertColumn[]
  /** Column names that form the ON CONFLICT target (must exist in `columns`). */
  conflictColumns: string[]
  /**
   * Columns to update on conflict. Defaults to every non-conflict column.
   * Pass an empty array for `DO NOTHING`.
   */
  updateColumns?: string[]
  /** One array of values per row, in the same order as `columns`. */
  rows: readonly unknown[][]
  /** Desired rows per INSERT statement (auto-capped to the bind-param limit). */
  chunkRows: number
  /** Run inside an existing transaction; otherwise a new one is opened. */
  client?: PoolClient
}): Promise<number> {
  const { table, columns, conflictColumns, rows, chunkRows, client } = options
  if (rows.length === 0) return 0

  const colNames = columns.map((c) => c.name)
  const conflictIdx = conflictColumns.map((name) => {
    const i = colNames.indexOf(name)
    if (i < 0) {
      throw new Error(
        `chunkedUpsert: conflict column "${name}" not present in columns for ${table}`,
      )
    }
    return i
  })

  // Dedupe within the batch (keep last) — a single INSERT cannot touch the same
  // conflict key twice ("ON CONFLICT ... cannot affect row a second time").
  const deduped = (() => {
    if (conflictIdx.length === 0) return rows as unknown[][]
    const map = new Map<string, unknown[]>()
    for (const row of rows) {
      const key = conflictIdx.map((i) => String(row[i])).join('\u0000')
      map.set(key, row as unknown[])
    }
    return [...map.values()]
  })()

  const updateColumns =
    options.updateColumns ?? colNames.filter((n) => !conflictColumns.includes(n))
  const conflictClause =
    updateColumns.length > 0
      ? `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateColumns
          .map((c) => `${c} = EXCLUDED.${c}`)
          .join(', ')}`
      : `ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`

  const perStatement = Math.max(
    1,
    Math.min(Math.floor(chunkRows) || 1, maxRowsForColumns(columns.length)),
  )
  const colList = colNames.join(', ')

  const run = async (c: PoolClient): Promise<number> => {
    let affected = 0
    for (let i = 0; i < deduped.length; i += perStatement) {
      const chunk = deduped.slice(i, i + perStatement)
      const values: unknown[] = []
      const tuples = chunk.map((row) => {
        const placeholders = columns.map((col, ci) => {
          values.push(row[ci])
          const p = `$${values.length}`
          return col.cast ? `${p}::${col.cast}` : p
        })
        return `(${placeholders.join(', ')})`
      })
      const sql = `INSERT INTO ${table} (${colList}) VALUES ${tuples.join(', ')} ${conflictClause}`
      const res = await c.query(sql, values)
      affected += res.rowCount ?? chunk.length
    }
    return affected
  }

  return client ? run(client) : withTransaction(run)
}
