import 'server-only'

import { query } from '@/lib/db/postgres'
import { POSTGRES_PRIORITY_TABLES } from '@/lib/postgres-known-tables'
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
    to: { table: 'vision_addresses', column: 'listing_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'vision_pid' },
    to: { table: 'vision_addresses', column: 'vision_pid' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: 'listing_price_history', column: 'listing_id' },
    source: 'documented',
  },
]

/** Expected columns when a known table is absent from Neon (migrations lag). */
const DOCUMENTED_POSTGRES_COLUMNS: Record<string, SqliteColumnInfo[]> = {
  vision_addresses: [
    { name: 'town', type: 'text', notNull: true, primaryKey: true, defaultValue: null },
    { name: 'vision_pid', type: 'text', notNull: true, primaryKey: true, defaultValue: null },
    { name: 'account_number', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'mblu', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'address_full', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'address_norm', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'listing_id', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'mls_id', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'parcel_url', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'field_card_r2_key', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'field_card', type: 'jsonb', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'content_fingerprint', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'scraped_at', type: 'timestamp with time zone', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'updated_at', type: 'timestamp with time zone', notNull: true, primaryKey: false, defaultValue: null },
  ],
  town_property_addresses: [
    { name: 'property_key', type: 'text', notNull: true, primaryKey: true, defaultValue: null },
    { name: 'parcel_number', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'town', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'street', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'unit', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'zip', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'address_full', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'address_norm', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'listing_id', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'mls_id', type: 'text', notNull: false, primaryKey: false, defaultValue: null },
    { name: 'source', type: 'text', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'verified_at', type: 'timestamp with time zone', notNull: true, primaryKey: false, defaultValue: null },
    { name: 'synced_at', type: 'timestamp with time zone', notNull: true, primaryKey: false, defaultValue: null },
  ],
}

function sortPostgresTableNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aPriority = POSTGRES_PRIORITY_TABLES.indexOf(a)
    const bPriority = POSTGRES_PRIORITY_TABLES.indexOf(b)
    if (aPriority >= 0 || bPriority >= 0) {
      if (aPriority < 0) return 1
      if (bPriority < 0) return -1
      return aPriority - bPriority
    }
    return a.localeCompare(b)
  })
}

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

    const liveNames = new Set(columnsByTable.keys())
    const tableNames = sortPostgresTableNames([
      ...liveNames,
      ...POSTGRES_PRIORITY_TABLES.filter((name) => !liveNames.has(name)),
    ])

    const tables: SqliteTableInfo[] = tableNames.map((name) => {
      const present = liveNames.has(name)
      if (present) {
        return {
          name,
          present: true,
          rowCount: countByTable.get(name) ?? 0,
          columns: columnsByTable.get(name) ?? [],
        }
      }
      return {
        name,
        present: false,
        rowCount: 0,
        columns: DOCUMENTED_POSTGRES_COLUMNS[name] ?? [],
      }
    })

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
