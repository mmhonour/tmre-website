import 'server-only'

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { listingPhotosDbPath, tryGetListingPhotosDb } from '@/lib/listing-photos-db'
import { isR2PhotoStoreConfigured } from '@/lib/r2-photo-store'
import type {
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

function tableRowCount(database: SqliteDatabase, tableName: string): number {
  try {
    const approx = database
      .prepare(`SELECT MAX(rowid) AS n FROM ${quoteIdent(tableName)}`)
      .get() as { n: number | null }
    return approx.n ?? 0
  } catch {
    return 0
  }
}

function inspectDatabase(database: SqliteDatabase): SqliteTableInfo[] {
  const tableRows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return tableRows.map((table) => {
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

function inspectHandle(
  database: SqliteDatabase | null,
  meta: Omit<SqliteDatabaseDiagram, 'available' | 'tables' | 'relationships' | 'error'>,
  options?: { error?: string; documentedRelationships?: SqliteRelationship[] },
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
    return {
      ...meta,
      available: true,
      tables: inspectDatabase(database),
      relationships: options?.documentedRelationships ?? [],
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

/**
 * Live SQLite file diagrams — listing photos only (MLS inventory is in Neon
 * Postgres). When R2 is the active photo backend the SQLite listing-photos.db
 * is a dormant legacy fallback (never read/written), so it's omitted from the
 * admin schema view; it only surfaces when R2 is not configured and SQLite is
 * actually serving photos.
 */
export function describeRunningSqliteDatabases(): SqliteDatabaseDiagram[] {
  if (isR2PhotoStoreConfigured()) return []

  const photosPath = listingPhotosDbPath()
  const photosCached = tryGetListingPhotosDb()
  const photosOpen = openReadonlyIfExists(photosPath)
  const photosDb = photosCached ?? photosOpen.database
  const photosDiagram = inspectHandle(
    photosDb,
    baseMeta(
      'listing-photos',
      'Listing photos',
      'Binary photo BLOB store keyed by MLS ID — round-trips through Netlify Blobs on serverless',
      photosPath,
    ),
    {
      error: photosDb ? undefined : (photosOpen.error ?? 'Photos DB unavailable in this runtime'),
    },
  )

  if (photosOpen.database && photosOpen.database !== photosCached) {
    try {
      photosOpen.database.close()
    } catch {
      /* ignore */
    }
  }

  return [photosDiagram]
}
