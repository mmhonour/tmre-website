import 'server-only'

import type { AdminSyncActionId, AdminSyncTableStatsReport } from '@/lib/admin-sync-types'
import { getListingsDb, setSyncMeta, tryGetReadDb } from '@/lib/listings-db'

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
  const database = tryGetReadDb()
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
