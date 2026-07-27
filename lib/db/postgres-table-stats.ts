import 'server-only'

import { query } from '@/lib/db/postgres'
import { POSTGRES_PRIORITY_TABLES } from '@/lib/postgres-known-tables'
import type { TableWriteStats } from '@/lib/sqlite-sync-stats'

/** Row counts per Postgres table — admin sync inventory + table stats reports. */
export async function collectPostgresTableStats(): Promise<TableWriteStats[]> {
  try {
    const rows = await query<{ table_name: string; row_count: string }>(
      `SELECT relname AS table_name, n_live_tup::text AS row_count
       FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY relname`,
    )

    const byName = new Map<string, TableWriteStats>()
    for (const row of rows) {
      const count = Number(row.row_count)
      if (!Number.isFinite(count) || count <= 0) continue
      byName.set(row.table_name, {
        table: row.table_name,
        queried: count,
        inserted: count,
        updated: 0,
      })
    }

    for (const name of POSTGRES_PRIORITY_TABLES) {
      if (!byName.has(name)) {
        byName.set(name, { table: name, queried: 0, inserted: 0, updated: 0 })
      }
    }

    return [...byName.values()].sort((a, b) => {
      const aPriority = POSTGRES_PRIORITY_TABLES.indexOf(a.table)
      const bPriority = POSTGRES_PRIORITY_TABLES.indexOf(b.table)
      if (aPriority >= 0 || bPriority >= 0) {
        if (aPriority < 0) return 1
        if (bPriority < 0) return -1
        return aPriority - bPriority
      }
      return a.table.localeCompare(b.table)
    })
  } catch (err) {
    console.warn('[postgres-table-stats] collectPostgresTableStats failed:', err)
    return []
  }
}
