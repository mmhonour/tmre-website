import 'server-only'

import { existsSync, statSync } from 'node:fs'
import type {
  AdminDatabaseSyncId,
  AdminDatabaseSyncStats,
  AdminDatabaseTableStat,
  AdminSyncActionId,
  AdminSyncTableStatsReport,
} from '@/lib/admin-sync-types'
import { listingPhotosDbPath, tryGetListingPhotosDb } from '@/lib/listing-photos-db'
import { getListingsDb, listingsDbPath, listingsReadDbPath, setSyncMeta, tryGetReadDb, tryGetWriteDb } from '@/lib/listings-db'

export type TableWriteStats = {
  table: string
  queried: number
  inserted: number
  updated: number
  deleted?: number
}

type TableCounters = {
  queried: number
  inserted: number
  updated: number
  deleted: number
}

export class SqliteWriteStatsCollector {
  private rows = new Map<string, TableCounters>()

  private ensure(table: string): TableCounters {
    let row = this.rows.get(table)
    if (!row) {
      row = { queried: 0, inserted: 0, updated: 0, deleted: 0 }
      this.rows.set(table, row)
    }
    return row
  }

  addQueried(table: string, count = 1): void {
    if (count <= 0) return
    this.ensure(table).queried += count
  }

  addInserted(table: string, count = 1): void {
    if (count <= 0) return
    this.ensure(table).inserted += count
  }

  addUpdated(table: string, count = 1): void {
    if (count <= 0) return
    this.ensure(table).updated += count
  }

  addDeleted(table: string, count = 1): void {
    if (count <= 0) return
    this.ensure(table).deleted += count
  }

  merge(other: SqliteWriteStatsCollector): void {
    for (const [table, counts] of other.rows) {
      const row = this.ensure(table)
      row.queried += counts.queried
      row.inserted += counts.inserted
      row.updated += counts.updated
      row.deleted += counts.deleted
    }
  }

  snapshot(): TableWriteStats[] {
    return [...this.rows.entries()]
      .map(([table, counts]) => ({
        table,
        queried: counts.queried,
        inserted: counts.inserted,
        updated: counts.updated,
        ...(counts.deleted > 0 ? { deleted: counts.deleted } : {}),
      }))
      .filter(
        (row) => row.queried > 0 || row.inserted > 0 || row.updated > 0 || (row.deleted ?? 0) > 0,
      )
      .sort((a, b) => a.table.localeCompare(b.table))
  }

  /** Table names touched during this collector's lifetime. */
  touchedTables(): string[] {
    return [...this.rows.keys()].sort((a, b) => a.localeCompare(b))
  }
}

/** Fan-out writes to two collectors (e.g. admin sync report + refresh lock history). */
export class DualSqliteWriteStatsCollector extends SqliteWriteStatsCollector {
  constructor(
    private primary: SqliteWriteStatsCollector,
    private secondary: SqliteWriteStatsCollector,
  ) {
    super()
  }

  addQueried(table: string, count = 1): void {
    this.primary.addQueried(table, count)
    this.secondary.addQueried(table, count)
  }

  addInserted(table: string, count = 1): void {
    this.primary.addInserted(table, count)
    this.secondary.addInserted(table, count)
  }

  addUpdated(table: string, count = 1): void {
    this.primary.addUpdated(table, count)
    this.secondary.addUpdated(table, count)
  }

  addDeleted(table: string, count = 1): void {
    this.primary.addDeleted(table, count)
    this.secondary.addDeleted(table, count)
  }
}

export function mergeSqliteWriteStats(
  stats: SqliteWriteStatsCollector | undefined,
  mirror: SqliteWriteStatsCollector | null,
): SqliteWriteStatsCollector | undefined {
  if (!mirror) return stats
  if (!stats) return mirror
  return new DualSqliteWriteStatsCollector(stats, mirror)
}

let activeRefreshLockStats: SqliteWriteStatsCollector | null = null

export function setActiveRefreshLockStats(
  collector: SqliteWriteStatsCollector | null,
): void {
  activeRefreshLockStats = collector
}

export function getActiveRefreshLockStats(): SqliteWriteStatsCollector | null {
  return activeRefreshLockStats
}

export function mergeWithRefreshLockStats(
  stats?: SqliteWriteStatsCollector,
): SqliteWriteStatsCollector | undefined {
  return mergeSqliteWriteStats(stats, activeRefreshLockStats)
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Row counts per user table — used for read-snapshot publish reporting. */
export function collectListingsDatabaseTableStats(): TableWriteStats[] {
  const database = tryGetReadDb() ?? getListingsDb()
  return collectDatabaseTableStats(database)
}

/** Row counts on the write DB — accurate before read snapshot publish. */
export function collectWriteDatabaseTableStats(): TableWriteStats[] {
  const database = tryGetWriteDb() ?? getListingsDb()
  return collectDatabaseTableStats(database)
}

function collectDatabaseTableStats(database: import('better-sqlite3').Database): TableWriteStats[] {
  const tables = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  const out: TableWriteStats[] = []
  for (const { name } of tables) {
    const row = database
      .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`)
      .get() as { count: number }
    if (row.count <= 0) continue
    out.push({
      table: name,
      queried: row.count,
      inserted: row.count,
      updated: 0,
    })
  }
  return out
}

const ADMIN_SYNC_TABLE_STATS_PREFIX = 'admin_sync_table_stats:'

export function saveAdminSyncTableStats(
  action: AdminSyncActionId,
  tables: TableWriteStats[],
): AdminSyncTableStatsReport {
  const report: AdminSyncTableStatsReport = {
    finishedAt: new Date().toISOString(),
    tables,
  }
  setSyncMeta(`${ADMIN_SYNC_TABLE_STATS_PREFIX}${action}`, JSON.stringify(report))
  return report
}

export function readAdminSyncTableStats(
  action: AdminSyncActionId,
): AdminSyncTableStatsReport | null {
  const database = tryGetWriteDb() ?? tryGetReadDb()
  if (!database) return null
  const row = database
    .prepare('SELECT value FROM sync_meta WHERE key = ?')
    .get(`${ADMIN_SYNC_TABLE_STATS_PREFIX}${action}`) as { value: string } | undefined
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as AdminSyncTableStatsReport
    if (!parsed?.finishedAt || !Array.isArray(parsed.tables)) return null
    return parsed
  } catch {
    return null
  }
}

export function readAllAdminSyncTableStats(): Partial<
  Record<AdminSyncActionId, AdminSyncTableStatsReport>
> {
  const actions: AdminSyncActionId[] = [
    'full-resync',
    'incremental',
    'listing-scores',
    'publish-snapshot',
    'stats-cache',
    'deal-of-the-day',
  ]
  const out: Partial<Record<AdminSyncActionId, AdminSyncTableStatsReport>> = {}
  for (const action of actions) {
    const report = readAdminSyncTableStats(action)
    if (report) out[action] = report
  }
  return out
}

type SqliteDatabase = import('better-sqlite3').Database

const ADMIN_DB_PRIORITY_TABLES: Record<AdminDatabaseSyncId, string[]> = {
  listings: ['listings', 'stats_cache', 'sync_meta', 'listing_scores'],
  'listings.read': ['listings', 'stats_cache', 'sync_meta'],
  'listing-photos': ['listing_photos'],
}

const SCHEMA_ONLY_MAX_BYTES = 50_000

function fileSizeBytes(filePath: string): number | null {
  try {
    if (!existsSync(filePath)) return null
    return statSync(filePath).size
  } catch {
    return null
  }
}

/** Prefer cheap estimates on huge blob tables; exact COUNT can stall Admin. */
function inventoryTableRowCount(database: SqliteDatabase, tableName: string): number {
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

function openReadonlyDatabase(filePath: string): SqliteDatabase | null {
  if (!existsSync(filePath)) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (
      filename: string,
      options?: { readonly?: boolean; fileMustExist?: boolean },
    ) => SqliteDatabase
    const database = new Database(filePath, { readonly: true, fileMustExist: true })
    database.pragma('busy_timeout = 2000')
    return database
  } catch {
    return null
  }
}

function collectDatabaseInventoryTables(
  database: SqliteDatabase,
  id: AdminDatabaseSyncId,
): AdminDatabaseTableStat[] {
  const priority = ADMIN_DB_PRIORITY_TABLES[id]
  const tableRows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  const byName = new Map<string, AdminDatabaseTableStat>()
  for (const { name } of tableRows) {
    const rowCount = inventoryTableRowCount(database, name)
    if (rowCount <= 0 && !priority.includes(name)) continue
    byName.set(name, {
      table: name,
      rowCount,
      approximate: name === 'listing_photos' && rowCount > 0 ? true : undefined,
    })
  }

  for (const name of priority) {
    if (!byName.has(name) && tableRows.some((row) => row.name === name)) {
      byName.set(name, { table: name, rowCount: 0 })
    }
  }

  const ordered = [...byName.values()].sort((a, b) => {
    const aPriority = priority.indexOf(a.table)
    const bPriority = priority.indexOf(b.table)
    if (aPriority >= 0 || bPriority >= 0) {
      if (aPriority < 0) return 1
      if (bPriority < 0) return -1
      return aPriority - bPriority
    }
    return a.table.localeCompare(b.table)
  })

  return ordered
}

function formatDatabaseInventorySummary(
  tables: AdminDatabaseTableStat[],
  options?: { schemaOnly?: boolean },
): string {
  if (tables.length === 0) {
    return options?.schemaOnly
      ? 'Schema only (0 rows) — run Full resync'
      : 'No tables with data'
  }
  const line = tables
    .map((row) => {
      const prefix = row.approximate ? '≈' : ''
      return `${row.table} ${prefix}${row.rowCount.toLocaleString()}`
    })
    .join(' · ')
  return options?.schemaOnly ? `${line} — deploy bundle is schema-only` : line
}

function inspectAdminDatabaseInventory(options: {
  id: AdminDatabaseSyncId
  label: string
  path: string
  database: SqliteDatabase | null
  error?: string
}): AdminDatabaseSyncStats {
  const { id, label, path, database, error } = options
  const exists = existsSync(path)
  const sizeBytes = fileSizeBytes(path)

  if (!database) {
    return {
      id,
      label,
      path,
      exists,
      sizeBytes,
      available: false,
      error: error ?? (exists ? 'Could not open database' : 'File not found on disk'),
      tables: [],
      summary: exists ? 'Database file present but could not be opened' : 'Not hydrated yet — run Full resync',
    }
  }

  try {
    const tables = collectDatabaseInventoryTables(database, id)
    const listingsCount = tables.find((row) => row.table === 'listings')?.rowCount ?? 0
    const photosCount = tables.find((row) => row.table === 'listing_photos')?.rowCount ?? 0
    const schemaOnly =
      exists &&
      (sizeBytes ?? 0) > 0 &&
      (sizeBytes ?? 0) < SCHEMA_ONLY_MAX_BYTES &&
      listingsCount === 0 &&
      photosCount === 0 &&
      id !== 'listing-photos'

    return {
      id,
      label,
      path,
      exists,
      sizeBytes,
      available: true,
      tables,
      summary: formatDatabaseInventorySummary(tables, { schemaOnly }),
    }
  } catch (err) {
    return {
      id,
      label,
      path,
      exists,
      sizeBytes,
      available: false,
      error: err instanceof Error ? err.message : String(err),
      tables: [],
      summary: 'Could not read table inventory',
    }
  }
}

/** Live row counts for listings, listings.read, and listing-photos — admin sync panel inventory. */
export function collectAdminDatabaseSyncStats(): AdminDatabaseSyncStats[] {
  const writePath = listingsDbPath()
  const readPath = listingsReadDbPath()
  const photosPath = listingPhotosDbPath()

  const writeCached = tryGetWriteDb()
  const readonlyWrite = openReadonlyDatabase(writePath)
  const writeDb = writeCached ?? readonlyWrite

  const readonlyRead = openReadonlyDatabase(readPath)
  const readCached = tryGetReadDb()
  let readDb = readonlyRead
  if (!readDb && readCached && readCached !== writeCached) readDb = readCached
  if (!readDb) readDb = writeDb

  const photosCached = tryGetListingPhotosDb()
  const readonlyPhotos = openReadonlyDatabase(photosPath)
  const photosDb = photosCached ?? readonlyPhotos

  try {
    return [
      inspectAdminDatabaseInventory({
        id: 'listings',
        label: 'listings',
        path: writePath,
        database: writeDb,
      }),
      inspectAdminDatabaseInventory({
        id: 'listings.read',
        label: 'listings.read',
        path: readPath,
        database: readDb,
        error: readDb ? undefined : 'Read snapshot missing — publish after sync',
      }),
      inspectAdminDatabaseInventory({
        id: 'listing-photos',
        label: 'listing-photos',
        path: photosPath,
        database: photosDb,
        error: photosDb ? undefined : 'Photos DB missing — warms during incremental / full sync',
      }),
    ]
  } finally {
    if (readonlyWrite && readonlyWrite !== writeCached) {
      try {
        readonlyWrite.close()
      } catch {
        /* ignore */
      }
    }
    if (readonlyRead) {
      try {
        readonlyRead.close()
      } catch {
        /* ignore */
      }
    }
    if (readonlyPhotos && readonlyPhotos !== photosCached) {
      try {
        readonlyPhotos.close()
      } catch {
        /* ignore */
      }
    }
  }
}
