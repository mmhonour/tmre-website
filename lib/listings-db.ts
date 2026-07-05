import 'server-only'

import { copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { deleteListingPhotos as removeListingPhotosFromStore } from '@/lib/listing-photos-db'
import {
  applyListingPropertyTax,
  parcelNumberFromRaw,
  parseTaxYearEnd,
  propertyTaxFromRaw,
} from '@/lib/listing-property-tax'
import { streetsMatch } from '@/lib/listing-history'
import type { Listing } from '@/lib/rets'

type SqliteDatabase = import('better-sqlite3').Database

let writeDb: SqliteDatabase | null = null
let readDb: SqliteDatabase | null = null
let dbDisabled = false

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'listings.db')
const BUNDLED_DB_MIN_BYTES = 50_000

function bundledListingsDbSources(): string[] {
  return [
    path.join(process.cwd(), 'data', 'listings.bundle.db'),
    path.join(process.cwd(), 'data', 'listings.db'),
  ]
}

/** Copy a shipped SQLite bundle into /tmp on cold serverless starts. */
function seedListingsDbIfNeeded(targetPath: string): void {
  try {
    if (existsSync(targetPath)) {
      const size = statSync(targetPath).size
      if (size >= BUNDLED_DB_MIN_BYTES) return
    }

    for (const src of bundledListingsDbSources()) {
      if (!existsSync(src)) continue
      if (statSync(src).size < BUNDLED_DB_MIN_BYTES) continue
      mkdirSync(path.dirname(targetPath), { recursive: true })
      copyFileSync(src, targetPath)
      console.info('[listings-db] seeded SQLite from bundled copy:', src)
      return
    }
  } catch (err) {
    console.warn('[listings-db] bundled seed skipped:', err)
  }
}

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

export function listingsReadDbPath(): string {
  const writePath = serverlessDbPath()
  if (writePath.endsWith('.db')) {
    return writePath.replace(/\.db$/, '.read.db')
  }
  return `${writePath}.read.db`
}

function resetReadDbConnection(): void {
  if (readDb && readDb !== writeDb) {
    try {
      readDb.close()
    } catch {
      /* ignore */
    }
  }
  readDb = null
}

/** Publish a read-only snapshot for API reads (called after sync / cache rebuild). */
export function publishListingsReadSnapshot(): void {
  const database = tryGetWriteDb()
  if (!database) return

  const writePath = listingsDbPath()
  const readPath = listingsReadDbPath()
  const tmpPath = `${readPath}.tmp`

  try {
    mkdirSync(path.dirname(readPath), { recursive: true })
    database.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(writePath, tmpPath)
    if (existsSync(readPath)) unlinkSync(readPath)
    renameSync(tmpPath, readPath)
    resetReadDbConnection()
    console.info('[listings-db] published read snapshot:', readPath)
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    console.error('[listings-db] read snapshot publish failed', err)
  }
}

/** False on Netlify/Lambda when the native better-sqlite3 module cannot load. */
export function isListingsDbAvailable(): boolean {
  return tryGetListingsDb() != null
}

type SqliteConstructor = new (
  filename: string,
  options?: { readonly?: boolean },
) => SqliteDatabase

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

function openSqliteDb(dbPath: string, readonly = false): SqliteDatabase {
  const Database = loadSqliteDatabase()
  if (!Database) throw new Error('SQLite unavailable')

  const database = readonly ? new Database(dbPath, { readonly: true }) : new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  return database
}

function tryGetWriteDb(): SqliteDatabase | null {
  if (dbDisabled) return null
  if (writeDb) return writeDb

  const Database = loadSqliteDatabase()
  if (!Database) return null

  try {
    const dbPath = listingsDbPath()
    seedListingsDbIfNeeded(dbPath)
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeDb = openSqliteDb(dbPath)
    initSchema(writeDb)

    const readPath = listingsReadDbPath()
    if (!existsSync(readPath) && existsSync(dbPath)) {
      publishListingsReadSnapshot()
    }

    return writeDb
  } catch (err) {
    if (!dbDisabled) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[listings-db] SQLite open failed — falling back to live RETS:', message)
    }
    dbDisabled = true
    writeDb = null
    return null
  }
}

function tryGetReadDb(): SqliteDatabase | null {
  if (dbDisabled) return null

  const readPath = listingsReadDbPath()
  if (!existsSync(readPath)) {
    return tryGetWriteDb()
  }

  if (readDb && readDb !== writeDb) return readDb

  try {
    readDb = openSqliteDb(readPath, true)
    return readDb
  } catch (err) {
    console.warn('[listings-db] read snapshot open failed — using write db:', err)
    return tryGetWriteDb()
  }
}

function tryGetListingsDb(): SqliteDatabase | null {
  return tryGetWriteDb()
}

/** @throws when SQLite is unavailable (local sync scripts). */
export function getListingsDb(): SqliteDatabase {
  const database = tryGetWriteDb()
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

    CREATE TABLE IF NOT EXISTS listing_tax_history (
      listing_id TEXT NOT NULL,
      parcel_number TEXT NOT NULL,
      tax_year_label TEXT NOT NULL,
      tax_year_end INTEGER NOT NULL,
      amount REAL NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (parcel_number, tax_year_end)
    );

    CREATE INDEX IF NOT EXISTS idx_listing_tax_history_listing_id
      ON listing_tax_history (listing_id);

    CREATE TABLE IF NOT EXISTS listing_if_estimates (
      listing_id TEXT PRIMARY KEY,
      sale_amount REAL,
      sale_sold_count INTEGER NOT NULL DEFAULT 0,
      sale_active_count INTEGER NOT NULL DEFAULT 0,
      rent_amount REAL,
      rent_sold_count INTEGER NOT NULL DEFAULT 0,
      rent_active_count INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL
    );
  `)

  ensureListingsColumns(database)
  ensureIfEstimateColumns(database)
}

function ensureIfEstimateColumns(database: SqliteDatabase): void {
  const cols = database
    .prepare('PRAGMA table_info(listing_if_estimates)')
    .all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('sale_amount_low')) {
    database.exec('ALTER TABLE listing_if_estimates ADD COLUMN sale_amount_low REAL')
  }
  if (!names.has('sale_amount_high')) {
    database.exec('ALTER TABLE listing_if_estimates ADD COLUMN sale_amount_high REAL')
  }
  if (!names.has('rent_amount_low')) {
    database.exec('ALTER TABLE listing_if_estimates ADD COLUMN rent_amount_low REAL')
  }
  if (!names.has('rent_amount_high')) {
    database.exec('ALTER TABLE listing_if_estimates ADD COLUMN rent_amount_high REAL')
  }
}

function ensureListingsColumns(database: SqliteDatabase): void {
  const cols = database
    .prepare('PRAGMA table_info(listings)')
    .all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('property_tax')) {
    database.exec('ALTER TABLE listings ADD COLUMN property_tax REAL')
  }
  if (!names.has('property_tax_year')) {
    database.exec('ALTER TABLE listings ADD COLUMN property_tax_year TEXT')
  }
}

type ListingDbRow = {
  data: string
  property_tax?: number | null
  property_tax_year?: string | null
}

function parseListingRow(row: ListingDbRow): Listing {
  const listing = JSON.parse(row.data) as Listing
  if (row.property_tax != null || row.property_tax_year) {
    return applyListingPropertyTax({
      ...listing,
      propertyTax: listing.propertyTax ?? row.property_tax ?? null,
      propertyTaxYear: listing.propertyTaxYear ?? row.property_tax_year ?? null,
    })
  }
  return applyListingPropertyTax(listing)
}

export type ListingTaxHistoryRow = {
  taxYearEnd: number
  taxYearLabel: string
  amount: number
}

function upsertListingTaxHistory(
  database: SqliteDatabase,
  listing: Listing,
  listingId: string,
  syncedAt: string,
): void {
  const { annualAmount, yearLabel } = propertyTaxFromRaw(listing.raw)
  if (annualAmount == null || !yearLabel) return

  const taxYearEnd = parseTaxYearEnd(yearLabel)
  if (taxYearEnd == null) return

  const parcelNumber = parcelNumberFromRaw(listing.raw) ?? listingId

  database
    .prepare(
      `INSERT INTO listing_tax_history (
        listing_id, parcel_number, tax_year_label, tax_year_end, amount, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(parcel_number, tax_year_end) DO UPDATE SET
        listing_id = excluded.listing_id,
        tax_year_label = excluded.tax_year_label,
        amount = excluded.amount,
        synced_at = excluded.synced_at`,
    )
    .run(listingId, parcelNumber, yearLabel, taxYearEnd, annualAmount, syncedAt)
}

function listingDbBindValues(
  listing: Listing,
  town: string,
  statusBucket: string,
  syncedAt: string,
) {
  const stored = applyListingPropertyTax(listing)
  const id = listingRowId(stored)
  return {
    id,
    mls_id: stored.mlsId,
    listing_key: stored.listingKey || null,
    town,
    status_bucket: statusBucket,
    mls_status: stored.status || null,
    property_type: stored.propertyType || null,
    price: stored.price,
    property_tax: stored.propertyTax ?? null,
    property_tax_year: stored.propertyTaxYear ?? null,
    modification_timestamp: stored.modificationTimestamp,
    data: JSON.stringify(stored),
    synced_at: syncedAt,
  }
}

/** True when the listings table has at least one row (partial sync or detail warm). */
export function listingsDbHasRows(): boolean {
  const database = tryGetReadDb()
  if (!database) return false
  const row = database.prepare('SELECT 1 FROM listings LIMIT 1').get()
  return row != null
}

export function getSyncMeta(key: string): string | null {
  const database = tryGetWriteDb()
  if (!database) return null
  const row = database
    .prepare('SELECT value FROM sync_meta WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSyncMeta(key: string, value: string): void {
  const database = tryGetWriteDb()
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

/** Upsert a single listing row without touching other rows in the town bucket. */
export function upsertListing(
  listing: Listing,
  town: string,
  statusBucket: string,
): boolean {
  const database = tryGetWriteDb()
  if (!database) return false

  const id = listingRowId(listing)
  if (!id) return false

  const syncedAt = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO listings (
        id, mls_id, listing_key, town, status_bucket, mls_status, property_type,
        price, property_tax, property_tax_year, modification_timestamp, data, synced_at
      ) VALUES (
        @id, @mls_id, @listing_key, @town, @status_bucket, @mls_status, @property_type,
        @price, @property_tax, @property_tax_year, @modification_timestamp, @data, @synced_at
      )
      ON CONFLICT(id) DO UPDATE SET
        mls_id = excluded.mls_id,
        listing_key = excluded.listing_key,
        town = excluded.town,
        status_bucket = excluded.status_bucket,
        mls_status = excluded.mls_status,
        property_type = excluded.property_type,
        price = excluded.price,
        property_tax = excluded.property_tax,
        property_tax_year = excluded.property_tax_year,
        modification_timestamp = excluded.modification_timestamp,
        data = excluded.data,
        synced_at = excluded.synced_at`,
    )
    .run(listingDbBindValues(listing, town, statusBucket, syncedAt))

  upsertListingTaxHistory(database, listing, id, syncedAt)

  return true
}

function listingMatchesStatusBucket(listing: Listing, statusBucket: string): boolean {
  const s = listing.status?.trim().toLowerCase()
  if (statusBucket === 'Active') {
    return s === 'active' || s === 'a' || s === 'coming soon' || s === 'cs'
  }
  if (statusBucket === 'Closed') {
    return s === 'closed' || s === 'c'
  }
  if (statusBucket === 'Expired') {
    return s === 'expired' || s === 'x'
  }
  return true
}

export function upsertTownListings(
  town: string,
  statusBucket: string,
  listings: Listing[],
): number {
  const database = tryGetWriteDb()
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
      price, property_tax, property_tax_year, modification_timestamp, data, synced_at
    ) VALUES (
      @id, @mls_id, @listing_key, @town, @status_bucket, @mls_status, @property_type,
      @price, @property_tax, @property_tax_year, @modification_timestamp, @data, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      mls_id = excluded.mls_id,
      listing_key = excluded.listing_key,
      town = excluded.town,
      status_bucket = excluded.status_bucket,
      mls_status = excluded.mls_status,
      property_type = excluded.property_type,
      price = excluded.price,
      property_tax = excluded.property_tax,
      property_tax_year = excluded.property_tax_year,
      modification_timestamp = excluded.modification_timestamp,
      data = excluded.data,
      synced_at = excluded.synced_at
  `)

  const tx = database.transaction((batch: Listing[]) => {
    for (const listing of batch) {
      const id = listingRowId(listing)
      if (!id) continue
      seen.add(id)
      upsert.run(listingDbBindValues(listing, town, statusBucket, syncedAt))
      upsertListingTaxHistory(database, listing, id, syncedAt)
    }

    const existing = database
      .prepare('SELECT id FROM listings WHERE town = ? AND status_bucket = ?')
      .all(town, statusBucket) as { id: string }[]

    const remove = database.prepare('DELETE FROM listings WHERE id = ?')
    for (const row of existing) {
      if (!seen.has(row.id)) {
        remove.run(row.id)
        removeListingPhotosFromStore(row.id)
      }
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
  const database = tryGetReadDb()
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
  const database = tryGetReadDb()
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
  const database = tryGetReadDb()
  if (!database) return null

  const row = database
    .prepare(
      `SELECT data, property_tax, property_tax_year
       FROM listings
       WHERE id = ? OR mls_id = ? OR listing_key = ?
       LIMIT 1`,
    )
    .get(id, id, id) as ListingDbRow | undefined
  if (!row) return null
  return parseListingRow(row)
}

/** Other MLS records at the same street address within a town. */
export function readAddressListingsFromDb(
  town: string,
  street: string,
  excludeMlsId?: string,
): Listing[] {
  const database = tryGetReadDb()
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
  const database = tryGetWriteDb()
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

  const listingsDatabase = tryGetReadDb()
  const writeDatabase = tryGetWriteDb()
  if (!listingsDatabase || !writeDatabase) return empty

  const totalRow = listingsDatabase
    .prepare('SELECT COUNT(*) AS count FROM listings')
    .get() as { count: number }
  const townRows = listingsDatabase
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
      writeDatabase.prepare('SELECT COUNT(*) AS count FROM stats_cache').get() as {
        count: number
      }
    ).count,
    lastStatsCache: getSyncMeta('last_stats_cache'),
    dealOfTheDayCacheEntries: (
      writeDatabase
        .prepare(`SELECT COUNT(*) AS count FROM stats_cache WHERE cache_key LIKE 'deal-of-the-day:%'`)
        .get() as { count: number }
    ).count,
    lastDealOfTheDayCache: getSyncMeta('last_deal_of_the_day_cache'),
  }
}

export function readStatsCacheRow(key: string): { payload: string; computedAt: string } | null {
  const database = tryGetWriteDb()
  if (!database) return null

  const row = database
    .prepare('SELECT payload, computed_at AS computedAt FROM stats_cache WHERE cache_key = ?')
    .get(key) as { payload: string; computedAt: string } | undefined
  return row ?? null
}

export function writeStatsCacheRow(key: string, payload: unknown): void {
  const database = tryGetWriteDb()
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
  const database = tryGetWriteDb()
  if (!database) return

  database
    .prepare(`DELETE FROM stats_cache WHERE cache_key NOT LIKE 'deal-of-the-day:%'`)
    .run()
}

export function clearCacheByPrefix(prefix: string): void {
  const database = tryGetWriteDb()
  if (!database) return

  database.prepare('DELETE FROM stats_cache WHERE cache_key LIKE ?').run(`${prefix}%`)
}

export function readListingTaxHistoryFromDb(
  parcelNumber: string | null,
  listingId: string,
  limit = 5,
): ListingTaxHistoryRow[] {
  const database = tryGetReadDb()
  if (!database) return []

  const key = parcelNumber?.trim() || listingId
  if (!key) return []

  const rows = database
    .prepare(
      `SELECT tax_year_end AS taxYearEnd, tax_year_label AS taxYearLabel, amount
       FROM listing_tax_history
       WHERE parcel_number = ?
       ORDER BY tax_year_end DESC
       LIMIT ?`,
    )
    .all(key, limit) as ListingTaxHistoryRow[]

  return rows
}

export type ListingIfEstimateRow = {
  listingId: string
  saleAmount: number | null
  saleAmountLow: number | null
  saleAmountHigh: number | null
  saleSoldCount: number
  saleActiveCount: number
  rentAmount: number | null
  rentAmountLow: number | null
  rentAmountHigh: number | null
  rentSoldCount: number
  rentActiveCount: number
  computedAt: string
}

export function upsertListingIfEstimate(row: ListingIfEstimateRow): void {
  const database = tryGetWriteDb()
  if (!database) return

  database
    .prepare(
      `INSERT INTO listing_if_estimates (
        listing_id, sale_amount, sale_amount_low, sale_amount_high,
        sale_sold_count, sale_active_count,
        rent_amount, rent_amount_low, rent_amount_high,
        rent_sold_count, rent_active_count, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(listing_id) DO UPDATE SET
        sale_amount = excluded.sale_amount,
        sale_amount_low = excluded.sale_amount_low,
        sale_amount_high = excluded.sale_amount_high,
        sale_sold_count = excluded.sale_sold_count,
        sale_active_count = excluded.sale_active_count,
        rent_amount = excluded.rent_amount,
        rent_amount_low = excluded.rent_amount_low,
        rent_amount_high = excluded.rent_amount_high,
        rent_sold_count = excluded.rent_sold_count,
        rent_active_count = excluded.rent_active_count,
        computed_at = excluded.computed_at`,
    )
    .run(
      row.listingId,
      row.saleAmount,
      row.saleAmountLow,
      row.saleAmountHigh,
      row.saleSoldCount,
      row.saleActiveCount,
      row.rentAmount,
      row.rentAmountLow,
      row.rentAmountHigh,
      row.rentSoldCount,
      row.rentActiveCount,
      row.computedAt,
    )
}

export function readListingIfEstimate(
  listingId: string,
): ListingIfEstimateRow | null {
  const database = tryGetReadDb()
  if (!database || !listingId.trim()) return null

  const row = database
    .prepare(
      `SELECT
        listing_id AS listingId,
        sale_amount AS saleAmount,
        sale_amount_low AS saleAmountLow,
        sale_amount_high AS saleAmountHigh,
        sale_sold_count AS saleSoldCount,
        sale_active_count AS saleActiveCount,
        rent_amount AS rentAmount,
        rent_amount_low AS rentAmountLow,
        rent_amount_high AS rentAmountHigh,
        rent_sold_count AS rentSoldCount,
        rent_active_count AS rentActiveCount,
        computed_at AS computedAt
       FROM listing_if_estimates
       WHERE listing_id = ?
       LIMIT 1`,
    )
    .get(listingId.trim()) as ListingIfEstimateRow | undefined

  return row ?? null
}

export type { ListingPhotoBlobRow } from '@/lib/listing-photos-db'
export {
  countFreshListingPhotos,
  countListingPhotos,
  listingPhotoStorageSpan,
  readListingPhotoBlob,
  upsertListingPhotoBlob,
} from '@/lib/listing-photos-db'
