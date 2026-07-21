import 'server-only'

import { query } from '@/lib/db/postgres'
import type {
  SqliteColumnInfo,
  SqliteDatabaseDiagram,
  SqliteRelationship,
  SqliteTableInfo,
} from '@/lib/sqlite-schema-diagram-types'

const DOCUMENTED_POSTGRES_RELATIONSHIPS: SqliteRelationship[] = [
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_tax_history', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_if_estimates', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_relations', column: 'subject_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_edge_scores', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_superlatives', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'town_property_addresses', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_price_history', column: 'listing_id' },
    source: 'documented',
  },
]

const PRIORITY_TABLES = [
  'listings',
  'sync_meta',
  'stats_cache',
  'listing_tax_history',
  'listing_if_estimates',
  'listing_relations',
  'listing_edge_scores',
  'listing_superlatives',
  'listing_price_history',
  'town_property_addresses',
  'zip_boundaries',
  'visitors',
  'saved_search_alerts',
  'saved_search_alert_deliveries',
  'sync_runs',
  'schema_migrations',
]

/** Live Neon Postgres schema for Admin diagrams. */
export async function describePostgresDatabase(): Promise<SqliteDatabaseDiagram> {
  const base: SqliteDatabaseDiagram = {
    id: 'postgres-listings',
    label: 'Neon Postgres',
    role: 'Hosted MLS inventory + derived tables — sync, scores, caches, addresses',
    fileName: 'Neon (DATABASE_URL)',
    absolutePath: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'Neon Postgres',
    relativePath: 'postgres://…',
    exists: true,
    sizeBytes: null,
    available: false,
    tables: [],
    relationships: DOCUMENTED_POSTGRES_RELATIONSHIPS,
  }

  try {
    const [columns, counts] = await Promise.all([
      query<{
        table_name: string
        column_name: string
        data_type: string
        is_nullable: string
        column_default: string | null
      }>(
        `SELECT table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
      ),
      query<{ table_name: string; row_count: string }>(
        `SELECT relname AS table_name, n_live_tup::text AS row_count
         FROM pg_stat_user_tables
         WHERE schemaname = 'public'`,
      ),
    ])

    const countByTable = new Map(counts.map((row) => [row.table_name, Number(row.row_count)]))
    const columnsByTable = new Map<string, SqliteColumnInfo[]>()
    for (const row of columns) {
      const list = columnsByTable.get(row.table_name) ?? []
      list.push({
        name: row.column_name,
        type: row.data_type,
        notNull: row.is_nullable === 'NO',
        primaryKey: false,
        defaultValue: row.column_default,
      })
      columnsByTable.set(row.table_name, list)
    }

    const tableNames = [...new Set(columns.map((row) => row.table_name))].sort((a, b) => {
      const aPriority = PRIORITY_TABLES.indexOf(a)
      const bPriority = PRIORITY_TABLES.indexOf(b)
      if (aPriority >= 0 || bPriority >= 0) {
        if (aPriority < 0) return 1
        if (bPriority < 0) return -1
        return aPriority - bPriority
      }
      return a.localeCompare(b)
    })

    const tables: SqliteTableInfo[] = tableNames.map((name) => ({
      name,
      rowCount: countByTable.get(name) ?? 0,
      columns: columnsByTable.get(name) ?? [],
    }))

    return {
      ...base,
      available: true,
      tables,
    }
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
