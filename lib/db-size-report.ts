import 'server-only'

import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db/postgres'
import { formatBytes } from '@/lib/sqlite-schema-diagram-types'
import {
  alwaysOnCosts,
  BIRTH_COLUMNS,
  decorateChatterRow,
  decorateGrowthRow,
  decorateListingsTown,
  decorateTableSize,
  GB,
  quoteIdent,
  STORAGE_USD_PER_GB_MONTH,
  storageMonthlyUsd,
  formatUsd,
  rollupGrowthRows,
  rollupListingsByTown,
  rollupTableSizes,
  DB_SIZE_REPORT_META_KEY,
  LAST_DB_SIZE_META_KEY,
  type DbSizeGrowthRow,
  type DbSizeListings,
  type DbSizeListingsTown,
  type DbSizeReport,
  type DbSizeReportTrigger,
  type DbSizeTable,
} from '@/lib/db-size-report-shared'

export type { DbSizeReport, DbSizeReportTrigger } from '@/lib/db-size-report-shared'
export {
  alwaysOnCosts,
  alwaysOnMonthlyUsd,
  decorateChatterRow,
  decorateGrowthRow,
  decorateTableSize,
  formatUsd,
  quoteIdent,
  storageMonthlyUsd,
  DB_SIZE_REPORT_META_KEY,
  LAST_DB_SIZE_META_KEY,
} from '@/lib/db-size-report-shared'

const MAX_GROWTH_TABLES = 30
const GROWTH_STATEMENT_TIMEOUT_MS = 12_000

async function tableSizes(client: PoolClient): Promise<DbSizeTable[]> {
  const { rows } = await client.query<{
    table_name: string
    total_bytes: string | number
    index_bytes: string | number
    toast_bytes: string | number
    live_rows: string | number
  }>(`
    SELECT c.relname                                              AS table_name,
           pg_total_relation_size(c.oid)                          AS total_bytes,
           pg_indexes_size(c.oid)                                 AS index_bytes,
           COALESCE(pg_total_relation_size(c.reltoastrelid), 0)   AS toast_bytes,
           COALESCE(s.n_live_tup, 0)                              AS live_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `)
  return rows
    .map((row) => {
      const total = Number(row.total_bytes)
      const indexes = Number(row.index_bytes)
      const toast = Number(row.toast_bytes)
      return decorateTableSize({
        table: row.table_name,
        rows: Number(row.live_rows),
        total,
        indexes,
        toast,
        heap: Math.max(0, total - indexes - toast),
      })
    })
    .filter((row) => row.total > 0)
}

async function birthColumns(client: PoolClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND data_type IN ('timestamp with time zone', 'timestamp without time zone')`,
  )
  const byTable = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set())
    byTable.get(row.table_name)!.add(row.column_name)
  }
  const picked = new Map<string, string>()
  for (const [table, columns] of byTable) {
    const choice = BIRTH_COLUMNS.find((candidate) => columns.has(candidate))
    if (choice) picked.set(table, choice)
  }
  return picked
}

async function tableGrowth(
  client: PoolClient,
  table: string,
  column: string,
): Promise<{
  total: number
  nulls: number
  d1: number
  d7: number
  d30: number
  oldest: string | null
  newest: string | null
} | null> {
  const tableSql = quoteIdent(table)
  const columnSql = quoteIdent(column)
  await client.query(`SET statement_timeout = ${GROWTH_STATEMENT_TIMEOUT_MS}`)
  try {
    const { rows } = await client.query<{
      total: string | number
      nulls: string | number
      d1: string | number
      d7: string | number
      d30: string | number
      oldest: string | null
      newest: string | null
    }>(`
      SELECT count(*)                                                             AS total,
             count(*) FILTER (WHERE ${columnSql} IS NULL)                          AS nulls,
             count(*) FILTER (WHERE ${columnSql} >= now() - interval '1 day')      AS d1,
             count(*) FILTER (WHERE ${columnSql} >= now() - interval '7 days')     AS d7,
             count(*) FILTER (WHERE ${columnSql} >= now() - interval '30 days')    AS d30,
             min(${columnSql})::text                                               AS oldest,
             max(${columnSql})::text                                               AS newest
      FROM ${tableSql}
    `)
    const row = rows[0]
    if (!row) return null
    return {
      total: Number(row.total),
      nulls: Number(row.nulls),
      d1: Number(row.d1),
      d7: Number(row.d7),
      d30: Number(row.d30),
      oldest: row.oldest,
      newest: row.newest,
    }
  } catch {
    return null
  } finally {
    await client.query('SET statement_timeout = 0')
  }
}

async function listingsByTown(
  client: PoolClient,
): Promise<DbSizeListingsTown[]> {
  try {
    const { rows } = await client.query<{
      town: string
      active: string | number
      closed: string | number
      listed_1d: string | number
      listed_7d: string | number
      listed_30d: string | number
      closed_1d: string | number
      closed_7d: string | number
      closed_30d: string | number
    }>(`
      SELECT COALESCE(NULLIF(btrim(town), ''), '(unknown)')           AS town,
             count(*) FILTER (WHERE status_bucket = 'Active')         AS active,
             count(*) FILTER (WHERE status_bucket = 'Closed')         AS closed,
             count(*) FILTER (WHERE list_date  >= now() - interval '1 day')   AS listed_1d,
             count(*) FILTER (WHERE list_date  >= now() - interval '7 days')  AS listed_7d,
             count(*) FILTER (WHERE list_date  >= now() - interval '30 days') AS listed_30d,
             count(*) FILTER (WHERE close_date >= now() - interval '1 day')   AS closed_1d,
             count(*) FILTER (WHERE close_date >= now() - interval '7 days')  AS closed_7d,
             count(*) FILTER (WHERE close_date >= now() - interval '30 days') AS closed_30d
      FROM listings
      GROUP BY 1
      ORDER BY 1
    `)
    return rows.map((row) =>
      decorateListingsTown({
        town: row.town,
        active: Number(row.active),
        closed: Number(row.closed),
        listed1d: Number(row.listed_1d),
        listed7d: Number(row.listed_7d),
        listed30d: Number(row.listed_30d),
        closed1d: Number(row.closed_1d),
        closed7d: Number(row.closed_7d),
        closed30d: Number(row.closed_30d),
      }),
    )
  } catch {
    return []
  }
}

async function listingsIncrement(client: PoolClient): Promise<DbSizeListings | null> {
  try {
    const { rows } = await client.query<{
      total: string | number
      active: string | number
      closed: string | number
      listed_1d: string | number
      listed_7d: string | number
      listed_30d: string | number
      closed_1d: string | number
      closed_7d: string | number
      closed_30d: string | number
    }>(`
      SELECT count(*)                                                         AS total,
             count(*) FILTER (WHERE status_bucket = 'Active')                 AS active,
             count(*) FILTER (WHERE status_bucket = 'Closed')                 AS closed,
             count(*) FILTER (WHERE list_date  >= now() - interval '1 day')   AS listed_1d,
             count(*) FILTER (WHERE list_date  >= now() - interval '7 days')  AS listed_7d,
             count(*) FILTER (WHERE list_date  >= now() - interval '30 days') AS listed_30d,
             count(*) FILTER (WHERE close_date >= now() - interval '1 day')   AS closed_1d,
             count(*) FILTER (WHERE close_date >= now() - interval '7 days')  AS closed_7d,
             count(*) FILTER (WHERE close_date >= now() - interval '30 days') AS closed_30d
      FROM listings
    `)
    const row = rows[0]
    if (!row) return null
    return {
      total: Number(row.total),
      active: Number(row.active),
      closed: Number(row.closed),
      listed1d: Number(row.listed_1d),
      listed7d: Number(row.listed_7d),
      listed30d: Number(row.listed_30d),
      closed1d: Number(row.closed_1d),
      closed7d: Number(row.closed_7d),
      closed30d: Number(row.closed_30d),
      listedPerDay: Number(row.listed_30d) / 30,
      closedPerDay: Number(row.closed_30d) / 30,
    }
  } catch {
    return null
  }
}

async function chattiestQueries(
  client: PoolClient,
): Promise<DbSizeReport['chatter']> {
  try {
    await client.query('SELECT 1 FROM pg_stat_statements LIMIT 1')
  } catch {
    return null
  }
  const { rows } = await client.query<{
    calls: string | number
    rows: string | number
    total_ms: string | number
    query: string
  }>(`
    SELECT calls,
           rows,
           round(total_exec_time::numeric, 0) AS total_ms,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 110) AS query
    FROM pg_stat_statements
    WHERE calls > 0
    ORDER BY calls DESC
    LIMIT 12
  `)
  const { rows: uptime } = await client.query<{ seconds: string | number }>(
    `SELECT extract(epoch FROM (now() - pg_postmaster_start_time()))::bigint AS seconds`,
  )
  const uptimeSeconds = Number(uptime[0]?.seconds ?? 0)
  const hoursAwake = uptimeSeconds / 3600
  const canExtrapolate = hoursAwake >= 1
  return {
    uptimeSeconds,
    hoursAwake,
    canExtrapolate,
    rows: rows.map((row) =>
      decorateChatterRow(
        {
          calls: Number(row.calls),
          rows: Number(row.rows),
          totalMs: Number(row.total_ms),
          query: row.query,
        },
        uptimeSeconds,
        canExtrapolate,
      ),
    ),
    alwaysOn: alwaysOnCosts(),
  }
}

export async function persistDbSizeReport(report: DbSizeReport): Promise<void> {
  const { setSyncMetaDurable } = await import('@/lib/db/sync-meta-store')
  await setSyncMetaDurable(DB_SIZE_REPORT_META_KEY, JSON.stringify(report))
  await setSyncMetaDurable(LAST_DB_SIZE_META_KEY, report.fetchedAt)
}

export async function readStoredDbSizeReport(): Promise<DbSizeReport | null> {
  const { getSyncMeta } = await import('@/lib/db/sync-meta')
  const raw = await getSyncMeta(DB_SIZE_REPORT_META_KEY)
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as DbSizeReport
    if (!parsed || typeof parsed !== 'object' || !parsed.fetchedAt) return null
    return parsed
  } catch {
    return null
  }
}

export async function loadDbSizeReport(
  options?: { trigger?: DbSizeReportTrigger },
): Promise<DbSizeReport> {
  const client = await getPool().connect()
  try {
    const { rows: meta } = await client.query<{
      db: string
      bytes: string | number
    }>(`SELECT current_database() AS db, pg_database_size(current_database()) AS bytes`)
    const totalBytes = Number(meta[0]?.bytes ?? 0)
    const tables = await tableSizes(client)
    const listings = await listingsIncrement(client)
    const byTown = listings ? await listingsByTown(client) : []
    const picked = await birthColumns(client)
    const growth: DbSizeGrowthRow[] = []
    const candidates = tables
      .filter((row) => row.rows > 0 && picked.has(row.table))
      .slice(0, MAX_GROWTH_TABLES)
    for (const size of candidates) {
      const column = picked.get(size.table)
      if (!column) continue
      const counts = await tableGrowth(client, size.table, column)
      if (!counts || counts.total === 0) continue
      growth.push(
        decorateGrowthRow({
          table: size.table,
          column,
          ...counts,
          tableBytes: size.total,
        }),
      )
    }
    growth.sort((a, b) => b.bytesPerDay - a.bytesPerDay)
    const growthBytesPerDay = growth.reduce((sum, row) => sum + row.bytesPerDay, 0)
    const growthGbPerYear = (growthBytesPerDay * 365) / GB
    const chatter = await chattiestQueries(client)
    return {
      fetchedAt: new Date().toISOString(),
      trigger: options?.trigger ?? 'adhoc',
      database: meta[0]?.db ?? '',
      totalBytes,
      totalLabel: formatBytes(totalBytes),
      storageMonthlyUsd: storageMonthlyUsd(totalBytes),
      storageMonthlyLabel: formatUsd(storageMonthlyUsd(totalBytes)),
      tables,
      tableRollup: rollupTableSizes(tables),
      listings,
      listingsByTown: byTown,
      listingsByTownRollup: rollupListingsByTown(byTown),
      growth,
      growthRollup: rollupGrowthRows(growth),
      growthBytesPerDay,
      growthBytesPerDayLabel: formatBytes(growthBytesPerDay),
      growthBytesPerMonthLabel: formatBytes(growthBytesPerDay * 30),
      growthGbPerYear,
      growthStorageAfterYearUsd: growthGbPerYear * STORAGE_USD_PER_GB_MONTH,
      sparseNotes: growth
        .filter((row) => row.sparsePct != null)
        .map((row) => `${row.table}.${row.column} is null on ${row.sparsePct}% of rows`),
      chatter,
      chatterUnavailable: chatter == null,
    }
  } finally {
    client.release()
  }
}
