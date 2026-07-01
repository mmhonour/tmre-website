import 'server-only'

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { streetsMatch } from '@/lib/listing-history'
import type { Listing } from '@/lib/rets'

type SqliteDatabase = import('better-sqlite3').Database

let db: SqliteDatabase | null = null
let dbDisabled = false

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'listings.db')

function serverlessDbPath(): string {
  if (process.env.LISTINGS_DB_PATH?.trim()) {
    return process.env.LISTINGS_DB_PATH.trim()
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    return '/tmp/listings.db'
  }
  return DEFAULT_DB_PATH
}

export function listingsDbPath(): string {
  return serverlessDbPath()
}

/** False on Netlify/Lambda when the native better-sqlite3 module cannot load. */
export function isListingsDbAvailable(): boolean {
  return tryGetListingsDb() != null
}

type SqliteConstructor = new (filename: string) => SqliteDatabase

function loadSqliteDatabase(): SqliteConstructor | null {
  try {
    // Dynamic require avoids crashing the whole server when native bindings are missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3') as SqliteConstructor
  } catch (err) {
    if (!dbDisabled) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[listings-db] SQLite unavailable — falling back to live RETS:', message)
    }
    dbDisabled = true
    return null
  }
}

function tryGetListingsDb(): SqliteDatabase | null {
  if (dbDisabled) return null
  if (db) return db

  const Database = loadSqliteDatabase()
  if (!Database) return null

  try {
    const dbPath = listingsDbPath()
    mkdirSync(path.dirname(dbPath), { recursive: true })
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initSchema(db)
    return db
  } catch (err) {
    if (!dbDisabled) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[listings-db] SQLite open failed — falling back to live RETS:', message)
    }
    dbDisabled = true
    db = null
    return null
  }
}

/** @throws when SQLite is unavailable (local sync scripts). */
export function getListingsDb(): SqliteDatabase {
  const database = tryGetListingsDb()
  if (!database) {
    throw new Error('Listings DB unavailable in this runtime')
  }
  return database
}

function initSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      mls_id TEXT NOT NULL,
      listing_key TEXT,
      town TEXT NOT NULL,
      status_bucket TEXT NOT NULL,
      mls_status TEXT,
      property_type TEXT,
      price REAL,
      modification_timestamp TEXT,
      data TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listings_town_status
      ON listings (town, status_bucket);

    CREATE INDEX IF NOT EXISTS idx_listings_mls_id
      ON listings (mls_id);

    CREATE INDEX IF NOT EXISTS idx_listings_listing_key
      ON listings (listing_key);

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      town TEXT,
      status_bucket TEXT,
      listings_count INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL DEFAULT 1,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS stats_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      computed_at TEXT NOT NULL
    );
  `)
}

export function getSyncMeta(key: string): string | null {
  const database = tryGetListingsDb()
  if (!database) return null
  const row = database
    .prepare('SELECT value FROM sync_meta WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSyncMeta(key: string, value: string): void {
  const database = tryGetListingsDb()
  if (!database) return
  database
    .prepare(
      'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value)
}

export function listingRowId(listing: Listing): string {
  return listing.listingKey?.trim() || listing.mlsId?.trim() || ''
}

function listingMatchesStatusBucket(listing: Listing, statusBucket: string): boolean {
  const s = listing.status?.trim().toLowerCase()
  if (statusBucket === 'Active') {
    return s === 'active' || s === 'a' || s === 'coming soon' || s === 'cs'
  }
  if (statusBucket === 'Closed') {
    return s === 'closed' || s === 'c'
  }
  return true
}

export function upsertTownListings(
  town: string,
  statusBucket: string,
  listings: Listing[],
): number {
  const database = tryGetListingsDb()
  if (!database) return 0

  // Never wipe a town bucket on an empty pull — transient RETS gaps would delete good cache.
  if (listings.length === 0) return 0

  const rows = listings.filter((l) => listingMatchesStatusBucket(l, statusBucket))
  if (rows.length === 0) {
    if (statusBucket === 'Closed' && listings.length > 0) {
      console.warn(
        `[listings-db] ${town} Closed sync returned ${listings.length} rows but none are Closed — skipping upsert`,
      )
    }
    return 0
  }

  const syncedAt = new Date().toISOString()
  const seen = new Set<string>()

  const upsert = database.prepare(`
    INSERT INTO listings (
      id, mls_id, listing_key, town, status_bucket, mls_status, property_type,
      price, modification_timestamp, data, synced_at
    ) VALUES (
      @id, @mls_id, @listing_key, @town, @status_bucket, @mls_status, @property_type,
      @price, @modification_timestamp, @data, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      mls_id = excluded.mls_id,
      listing_key = excluded.listing_key,
      town = excluded.town,
      status_bucket = excluded.status_bucket,
      mls_status = excluded.mls_status,
      property_type = excluded.property_type,
      price = excluded.price,
      modification_timestamp = excluded.modification_timestamp,
      data = excluded.data,
      synced_at = excluded.synced_at
  `)

  const tx = database.transaction((batch: Listing[]) => {
    for (const listing of batch) {
      const id = listingRowId(listing)
      if (!id) continue
      seen.add(id)
      upsert.run({
        id,
        mls_id: listing.mlsId,
        listing_key: listing.listingKey || null,
        town,
        status_bucket: statusBucket,
        mls_status: listing.status || null,
        property_type: listing.propertyType || null,
        price: listing.price,
        modification_timestamp: listing.modificationTimestamp,
        data: JSON.stringify(listing),
        synced_at: syncedAt,
      })
    }

    const existing = database
      .prepare('SELECT id FROM listings WHERE town = ? AND status_bucket = ?')
      .all(town, statusBucket) as { id: string }[]

    const remove = database.prepare('DELETE FROM listings WHERE id = ?')
    for (const row of existing) {
      if (!seen.has(row.id)) remove.run(row.id)
    }
  })

  tx(rows)
  return seen.size
}

export function readListingsFromDb(
  town: string,
  statusBucket: string,
  limit?: number,
): Listing[] {
  const database = tryGetListingsDb()
  if (!database) return []

  const sql = limit
    ? `SELECT data FROM listings
       WHERE town = ? AND status_bucket = ?
       ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price DESC
       LIMIT ?`
    : `SELECT data FROM listings
       WHERE town = ? AND status_bucket = ?
       ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price DESC`

  const rows = limit
    ? (database.prepare(sql).all(town, statusBucket, limit) as { data: string }[])
    : (database.prepare(sql).all(town, statusBucket) as { data: string }[])

  return rows.map((row) => JSON.parse(row.data) as Listing)
}

export function readAllListingsFromDb(
  towns: readonly string[],
  statusBucket: string,
): Listing[] {
  const database = tryGetListingsDb()
  if (!database || towns.length === 0) return []

  const placeholders = towns.map(() => '?').join(', ')
  const sql = `SELECT data FROM listings
    WHERE status_bucket = ? AND town IN (${placeholders})
    ORDER BY price DESC NULLS LAST`
  const rows = database
    .prepare(sql)
    .all(statusBucket, ...towns) as { data: string }[]
  return rows.map((row) => JSON.parse(row.data) as Listing)
}

export function readListingByIdFromDb(id: string): Listing | null {
  const database = tryGetListingsDb()
  if (!database) return null

  const row = database
    .prepare('SELECT data FROM listings WHERE id = ? OR mls_id = ? OR listing_key = ? LIMIT 1')
    .get(id, id, id) as { data: string } | undefined
  if (!row) return null
  return JSON.parse(row.data) as Listing
}

/** Other MLS records at the same street address within a town. */
export function readAddressListingsFromDb(
  town: string,
  street: string,
  excludeMlsId?: string,
): Listing[] {
  const database = tryGetListingsDb()
  if (!database) return []

  const rows = database
    .prepare('SELECT data FROM listings WHERE town = ?')
    .all(town) as { data: string }[]

  return rows
    .map((row) => JSON.parse(row.data) as Listing)
    .filter((listing) => {
      if (excludeMlsId && listing.mlsId === excludeMlsId) return false
      const addr = listing.address.street?.trim() || listing.address.full?.trim() || ''
      return streetsMatch(street, addr)
    })
}

export function recordSyncRun(input: {
  startedAt: string
  finishedAt: string
  town: string
  statusBucket: string
  listingsCount: number
  ok: boolean
  error?: string | null
}): void {
  const database = tryGetListingsDb()
  if (!database) return

  database
    .prepare(
      `INSERT INTO sync_runs (
        started_at, finished_at, town, status_bucket, listings_count, ok, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.startedAt,
      input.finishedAt,
      input.town,
      input.statusBucket,
      input.listingsCount,
      input.ok ? 1 : 0,
      input.error ?? null,
    )
}

export function getListingsDbStats(): {
  total: number
  byTown: Record<string, number>
  lastFullSync: string | null
  statsCacheEntries: number
  lastStatsCache: string | null
  dealOfTheDayCacheEntries: number
  lastDealOfTheDayCache: string | null
} {
  const empty = {
    total: 0,
    byTown: {} as Record<string, number>,
    lastFullSync: null as string | null,
    statsCacheEntries: 0,
    lastStatsCache: null as string | null,
    dealOfTheDayCacheEntries: 0,
    lastDealOfTheDayCache: null as string | null,
  }

  const database = tryGetListingsDb()
  if (!database) return empty

  const totalRow = database
    .prepare('SELECT COUNT(*) AS count FROM listings')
    .get() as { count: number }
  const townRows = database
    .prepare(
      `SELECT town, COUNT(*) AS count
       FROM listings
       WHERE status_bucket = 'Active'
       GROUP BY town`,
    )
    .all() as { town: string; count: number }[]

  const byTown: Record<string, number> = {}
  for (const row of townRows) byTown[row.town] = row.count

  return {
    total: totalRow.count,
    byTown,
    lastFullSync: getSyncMeta('last_full_sync'),
    statsCacheEntries: (
      database.prepare('SELECT COUNT(*) AS count FROM stats_cache').get() as {
        count: number
      }
    ).count,
    lastStatsCache: getSyncMeta('last_stats_cache'),
    dealOfTheDayCacheEntries: (
      database
        .prepare(`SELECT COUNT(*) AS count FROM stats_cache WHERE cache_key LIKE 'deal-of-the-day:%'`)
        .get() as { count: number }
    ).count,
    lastDealOfTheDayCache: getSyncMeta('last_deal_of_the_day_cache'),
  }
}

export function readStatsCacheRow(key: string): { payload: string; computedAt: string } | null {
  const database = tryGetListingsDb()
  if (!database) return null

  const row = database
    .prepare('SELECT payload, computed_at AS computedAt FROM stats_cache WHERE cache_key = ?')
    .get(key) as { payload: string; computedAt: string } | undefined
  return row ?? null
}

export function writeStatsCacheRow(key: string, payload: unknown): void {
  const database = tryGetListingsDb()
  if (!database) return

  database
    .prepare(
      `INSERT INTO stats_cache (cache_key, payload, computed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         computed_at = excluded.computed_at`,
    )
    .run(key, JSON.stringify(payload), new Date().toISOString())
}

export function clearStatsCache(): void {
  const database = tryGetListingsDb()
  if (!database) return

  database
    .prepare(`DELETE FROM stats_cache WHERE cache_key NOT LIKE 'deal-of-the-day:%'`)
    .run()
}

export function clearCacheByPrefix(prefix: string): void {
  const database = tryGetListingsDb()
  if (!database) return

  database.prepare('DELETE FROM stats_cache WHERE cache_key LIKE ?').run(`${prefix}%`)
}
