import 'server-only'

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { listingPhotosDbPath, tryGetListingPhotosDb } from '@/lib/listing-photos-db'
import {
  getListingsDb,
  getSyncMeta,
  isListingsDbAvailable,
  listingsDbPath,
  listingsReadDbPath,
} from '@/lib/listings-db'
import type {
  SqliteColumnRef,
  SqliteDatabaseDiagram,
  SqliteRelationship,
  SqliteTableInfo,
} from '@/lib/sqlite-schema-diagram-types'

export type {
  SqliteColumnInfo,
  SqliteColumnRef,
  SqliteDatabaseDiagram,
  SqliteRelationship,
  SqliteTableInfo,
} from '@/lib/sqlite-schema-diagram-types'
export { formatBytes } from '@/lib/sqlite-schema-diagram-types'

const PROPERTY_ADDRESS_TABLE = 'town_property_addresses'

type SqliteDatabase = import('better-sqlite3').Database

function formatRelativePath(absolutePath: string): string {
  const cwd = process.cwd()
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
  }
  return absolutePath.replace(/\\/g, '/')
}

function fileSizeBytes(filePath: string): number | null {
  try {
    if (!existsSync(filePath)) return null
    return statSync(filePath).size
  } catch {
    return null
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Prefer cheap estimates on huge blob tables; exact COUNT can stall Admin. */
function tableRowCount(database: SqliteDatabase, tableName: string): number {
  try {
    if (tableName === 'listing_photos') {
      const approx = database
        .prepare(`SELECT MAX(rowid) AS n FROM ${quoteIdent(tableName)}`)
        .get() as { n: number | null }
      return approx.n ?? 0
    }
    const countRow = database
      .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`)
      .get() as { count: number }
    return countRow.count
  } catch {
    return 0
  }
}

/** Logical joins — SQLite schemas omit FOREIGN KEY constraints. */
const DOCUMENTED_LISTINGS_RELATIONSHIPS: SqliteRelationship[] = [
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
    to: { table: 'listing_relations', column: 'related_id' },
    source: 'documented',
  },
  {
    from: { table: 'listings', column: 'id' },
    to: { table: PROPERTY_ADDRESS_TABLE, column: 'listing_id' },
    source: 'documented',
  },
]

const DOCUMENTED_PROPERTY_ADDRESS_RELATIONSHIPS: SqliteRelationship[] = [
  {
    from: { table: 'listings', column: 'id' },
    to: { table: PROPERTY_ADDRESS_TABLE, column: 'listing_id' },
    source: 'documented',
  },
]

function relationshipKey(rel: SqliteRelationship): string {
  return `${rel.from.table}.${rel.from.column}->${rel.to.table}.${rel.to.column}`
}

function pragmaForeignKeys(database: SqliteDatabase, tableName: string): SqliteRelationship[] {
  try {
    const rows = database.prepare(`PRAGMA foreign_key_list(${quoteIdent(tableName)})`).all() as {
      table: string
      from: string
      to: string
    }[]
    return rows.map((row) => ({
      from: { table: row.table, column: row.to },
      to: { table: tableName, column: row.from },
      source: 'pragma' as const,
    }))
  } catch {
    return []
  }
}

function inspectRelationships(
  database: SqliteDatabase,
  tables: SqliteTableInfo[],
  documented: SqliteRelationship[],
): SqliteRelationship[] {
  const tableNames = new Set(tables.map((t) => t.name))
  const columnExists = (ref: SqliteColumnRef) =>
    tables
      .find((t) => t.name === ref.table)
      ?.columns.some((c) => c.name === ref.column) ?? false

  const merged = new Map<string, SqliteRelationship>()
  for (const rel of documented) {
    if (tableNames.has(rel.from.table) && tableNames.has(rel.to.table) && columnExists(rel.from) && columnExists(rel.to)) {
      merged.set(relationshipKey(rel), rel)
    }
  }
  for (const table of tables) {
    for (const rel of pragmaForeignKeys(database, table.name)) {
      if (tableNames.has(rel.from.table) && columnExists(rel.from) && columnExists(rel.to)) {
        merged.set(relationshipKey(rel), rel)
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      a.from.table.localeCompare(b.from.table) ||
      a.to.table.localeCompare(b.to.table) ||
      a.from.column.localeCompare(b.from.column),
  )
}

function inspectDatabase(
  database: SqliteDatabase,
  tableFilter?: (name: string) => boolean,
): SqliteTableInfo[] {
  const tableRows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return tableRows
    .filter((table) => !tableFilter || tableFilter(table.name))
    .map((table) => {
    const cols = database.prepare(`PRAGMA table_info(${quoteIdent(table.name)})`).all() as {
      name: string
      type: string
      notnull: number
      dflt_value: string | number | null
      pk: number
    }[]

    return {
      name: table.name,
      rowCount: tableRowCount(database, table.name),
      columns: cols.map((col) => ({
        name: col.name,
        type: col.type || 'ANY',
        notNull: col.notnull === 1,
        primaryKey: col.pk > 0,
        defaultValue: col.dflt_value == null ? null : String(col.dflt_value),
      })),
    }
  })
}

function baseMeta(
  id: string,
  label: string,
  role: string,
  filePath: string,
): Omit<SqliteDatabaseDiagram, 'available' | 'tables' | 'relationships' | 'error'> {
  return {
    id,
    label,
    role,
    fileName: path.basename(filePath),
    absolutePath: filePath,
    relativePath: formatRelativePath(filePath),
    exists: existsSync(filePath),
    sizeBytes: fileSizeBytes(filePath),
  }
}

function propertyAddressRoleLine(): string {
  const base =
    'Verified MLS + Vision assessor addresses — stored in listings.db (town_property_addresses); weekly sync Mon 1am ET'
  const syncedAt = getSyncMeta('property_addresses_synced_at')
  if (!syncedAt) return `${base} · not synced yet`
  const statsRaw = getSyncMeta('property_addresses_last_stats')
  if (!statsRaw) return `${base} · last sync ${syncedAt}`
  try {
    const stats = JSON.parse(statsRaw) as {
      totalRows?: number
      mlsRows?: number
      assessorRows?: number
    }
    const total = stats.totalRows ?? 0
    const mls = stats.mlsRows ?? 0
    const assessor = stats.assessorRows ?? 0
    return `${base} · ${total.toLocaleString()} rows (${mls.toLocaleString()} MLS, ${assessor.toLocaleString()} assessor) · synced ${syncedAt}`
  } catch {
    return `${base} · last sync ${syncedAt}`
  }
}

function inspectHandle(
  database: SqliteDatabase | null,
  meta: Omit<SqliteDatabaseDiagram, 'available' | 'tables' | 'relationships' | 'error'>,
  options?: {
    error?: string
    documentedRelationships?: SqliteRelationship[]
    tableFilter?: (name: string) => boolean
  },
): SqliteDatabaseDiagram {
  if (!database) {
    return {
      ...meta,
      available: false,
      tables: [],
      relationships: [],
      error: options?.error ?? (meta.exists ? 'Could not open database' : 'File not found'),
    }
  }

  try {
    const tables = inspectDatabase(database, options?.tableFilter)
    return {
      ...meta,
      available: true,
      tables,
      relationships: inspectRelationships(
        database,
        tables,
        options?.documentedRelationships ?? [],
      ),
    }
  } catch (err) {
    return {
      ...meta,
      available: false,
      tables: [],
      relationships: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function openReadonlyIfExists(filePath: string): { database: SqliteDatabase | null; error?: string } {
  if (!existsSync(filePath)) return { database: null, error: 'File not found' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (
      filename: string,
      options?: { readonly?: boolean; fileMustExist?: boolean },
    ) => SqliteDatabase
    const database = new Database(filePath, { readonly: true, fileMustExist: true })
    database.pragma('busy_timeout = 2000')
    return { database }
  } catch (err) {
    return {
      database: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function describeRunningSqliteDatabases(): SqliteDatabaseDiagram[] {
  const writePath = listingsDbPath()
  const readPath = listingsReadDbPath()
  const photosPath = listingPhotosDbPath()
  const bundlePath = path.join(process.cwd(), 'data', 'listings.bundle.db')

  let writeDb: SqliteDatabase | null = null
  let writeError: string | undefined
  try {
    writeDb = isListingsDbAvailable() ? getListingsDb() : null
    if (!writeDb) writeError = 'Listings DB unavailable in this runtime'
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err)
  }

  const writeDiagram = inspectHandle(
    writeDb,
    baseMeta('listings-write', 'Listings (write)', 'Primary MLS write DB — sync, scores, and cache writes', writePath),
    { error: writeError, documentedRelationships: DOCUMENTED_LISTINGS_RELATIONSHIPS },
  )

  const readOpen = openReadonlyIfExists(readPath)
  const readDiagram = inspectHandle(
    readOpen.database,
    baseMeta(
      'listings-read',
      'Listings (read snapshot)',
      'API read replica published after successful syncs',
      readPath,
    ),
    { error: readOpen.error, documentedRelationships: DOCUMENTED_LISTINGS_RELATIONSHIPS },
  )

  const propertyAddressDb = writeDb ?? readOpen.database
  const propertyAddressDiagram = inspectHandle(
    propertyAddressDb,
    baseMeta(
      'property-addresses',
      'Property address directory',
      propertyAddressRoleLine(),
      writePath,
    ),
    {
      error: propertyAddressDb
        ? undefined
        : writeError ?? readOpen.error ?? 'Listings DB unavailable — address table lives in listings.db',
      documentedRelationships: DOCUMENTED_PROPERTY_ADDRESS_RELATIONSHIPS,
      tableFilter: (name) => name === PROPERTY_ADDRESS_TABLE,
    },
  )
  if (propertyAddressDiagram.available && propertyAddressDiagram.tables.length === 0) {
    propertyAddressDiagram.error =
      `${PROPERTY_ADDRESS_TABLE} table not found — restart the server to migrate schema, or run property address sync`
  }

  try {
    readOpen.database?.close()
  } catch {
    /* ignore */
  }

  const photosDb = tryGetListingPhotosDb()
  const photosDiagram = inspectHandle(
    photosDb,
    baseMeta(
      'listing-photos',
      'Listing photos',
      'Binary photo BLOB store keyed by MLS ID',
      photosPath,
    ),
    { error: photosDb ? undefined : 'Photos DB unavailable in this runtime' },
  )

  const diagrams = [writeDiagram, readDiagram, photosDiagram, propertyAddressDiagram]

  if (existsSync(bundlePath)) {
    const bundleOpen = openReadonlyIfExists(bundlePath)
    diagrams.push(
      inspectHandle(
        bundleOpen.database,
        baseMeta(
          'listings-bundle',
          'Listings bundle (deploy artifact)',
          'Copied into Netlify /tmp on cold start — not live traffic',
          bundlePath,
        ),
        { error: bundleOpen.error, documentedRelationships: DOCUMENTED_LISTINGS_RELATIONSHIPS },
      ),
    )
    try {
      bundleOpen.database?.close()
    } catch {
      /* ignore */
    }
  }

  return diagrams
}
