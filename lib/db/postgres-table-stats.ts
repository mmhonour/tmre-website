import 'server-only'

import { query } from '@/lib/db/postgres'
import { POSTGRES_PRIORITY_TABLES } from '@/lib/postgres-known-tables'
import type { TableWriteStats } from '@/lib/sqlite-sync-stats'

export type PostgresTableStat = TableWriteStats & {
  /** False when known in catalog but absent from Neon information_schema. */
  present: boolean
}

/** Row counts per Postgres table — admin sync inventory + table stats reports. */
export async function collectPostgresTableStats(): Promise<PostgresTableStat[]> {
  try {
    const [statRows, liveRows] = await Promise.all([
      query<{ table_name: string; row_count: string }>(
        `SELECT relname AS table_name, n_live_tup::text AS row_count
         FROM pg_stat_user_tables
         WHERE schemaname = 'public'
         ORDER BY relname`,
      ),
      query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'`,
      ),
    ])

    const live = new Set(liveRows.map((row) => row.table_name))
    const byName = new Map<string, PostgresTableStat>()

    for (const row of statRows) {
      const count = Number(row.row_count)
      if (!Number.isFinite(count)) continue
      byName.set(row.table_name, {
        table: row.table_name,
        queried: Math.max(0, count),
        inserted: Math.max(0, count),
        updated: 0,
        present: live.has(row.table_name),
      })
    }

    for (const name of live) {
      if (!byName.has(name)) {
        byName.set(name, {
          table: name,
          queried: 0,
          inserted: 0,
          updated: 0,
          present: true,
        })
      }
    }

    for (const name of POSTGRES_PRIORITY_TABLES) {
      if (!byName.has(name)) {
        byName.set(name, {
          table: name,
          queried: 0,
          inserted: 0,
          updated: 0,
          present: live.has(name),
        })
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
