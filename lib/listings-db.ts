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
import type { SqliteWriteStatsCollector } from '@/lib/sqlite-sync-stats'
import { isServerlessRuntime } from '@/lib/runtime-host'

function withRefreshLockStats(
  stats?: SqliteWriteStatsCollector,
): SqliteWriteStatsCollector | undefined {
  // Lazy require avoids a static import cycle (sqlite-sync-stats → listings-db).
  const { mergeWithRefreshLockStats } = require('@/lib/sqlite-sync-stats') as typeof import('@/lib/sqlite-sync-stats')
  return mergeWithRefreshLockStats(stats)
}

type SqliteDatabase = import('better-sqlite3').Database

let writeDb: SqliteDatabase | null = null
let readDb: SqliteDatabase | null = null
/** Permanent — native better-sqlite3 bindings cannot load in this process. */
let nativeModuleUnavailable = false
let nativeModuleLoadError: string | null = null
/** Transient — last open/seed failure; does not block retries. */
let lastOpenError: string | null = null

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'listings.db')
const BUNDLED_DB_MIN_BYTES = 50_000

function bundledListingsDbSources(): string[] {
  return [
    path.join(process.cwd(), 'data', 'listings.bundle.db'),
    path.join(process.cwd(), 'data', 'listings.db'),
  ]
}

export type ListingsDbRuntimeDiagnostics = {
  cwd: string
  isServerless: boolean
  writePath: string
  readPath: string
  bundleSources: { path: string; exists: boolean; bytes: number | null }[]
  writeDbExists: boolean
  writeDbBytes: number | null
  nativeModuleAvailable: boolean
  nativeModuleError: string | null
  lastOpenError: string | null
  connected: boolean
}

function fileStatBytes(filePath: string): number | null {
  try {
    if (!existsSync(filePath)) return null
    return statSync(filePath).size
  } catch {
    return null
  }
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
  if (isServerlessRuntime()) {
    return '/tmp/listings.db'
  }
  return DEFAULT_DB_PATH
}

export function listingsDbPath(): string {
  return serverlessDbPath()
}

/** Eager serverless seed — call from instrumentation before first request. */
export function ensureListingsDbSeeded(): void {
  seedListingsDbIfNeeded(listingsDbPath())
}

export function describeListingsDbRuntime(): ListingsDbRuntimeDiagnostics {
  const writePath = listingsDbPath()
  const readPath = listingsReadDbPath()
  const bundleSources = bundledListingsDbSources().map((src) => ({
    path: src,
    exists: existsSync(src),
    bytes: fileStatBytes(src),
  }))

  return {
    cwd: process.cwd(),
    isServerless: isServerlessRuntime(),
    writePath,
    readPath,
    bundleSources,
    writeDbExists: existsSync(writePath),
    writeDbBytes: fileStatBytes(writePath),
    nativeModuleAvailable: !nativeModuleUnavailable,
    nativeModuleError: nativeModuleLoadError,
    lastOpenError,
    connected: writeDb != null,
  }
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
    // Close any open read handle first — Windows returns EBUSY while the
    // snapshot file is still mapped by better-sqlite3.
    resetReadDbConnection()
    mkdirSync(path.dirname(readPath), { recursive: true })
    database.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(writePath, tmpPath)
    try {
      if (existsSync(readPath)) unlinkSync(readPath)
      renameSync(tmpPath, readPath)
    } catch (replaceErr) {
      // Fallback when unlink is still locked: overwrite in place.
      copyFileSync(tmpPath, readPath)
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
      if (!(replaceErr instanceof Error && 'code' in replaceErr && replaceErr.code === 'EBUSY')) {
        console.warn('[listings-db] read snapshot replace used copy fallback:', replaceErr)
      }
    }
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

function listingsTableHasGoldilocksColumns(database: SqliteDatabase): boolean {
  const cols = database.prepare('PRAGMA table_info(listings)').all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  return (
    names.has('goldilocks_score') &&
    names.has('goldilocks_breakdown') &&
    names.has('goldilocks_scored_at')
  )
}

/** False on Netlify/Lambda when the native better-sqlite3 module cannot load. */
export function isListingsDbAvailable(): boolean {
  return tryGetListingsDb() != null
}

type SqliteConstructor = new (
  filename: string,
  options?: { readonly?: boolean },
) => SqliteDatabase

let sqliteConstructor: SqliteConstructor | null | undefined

function loadSqliteDatabase(): SqliteConstructor | null {
  if (nativeModuleUnavailable) return null
  if (sqliteConstructor !== undefined) return sqliteConstructor

  try {
    // Dynamic require avoids crashing the whole server when native bindings are missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sqliteConstructor = require('better-sqlite3') as SqliteConstructor
    nativeModuleLoadError = null
    return sqliteConstructor
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[listings-db] SQLite native module unavailable — falling back to live RETS:', message)
    nativeModuleUnavailable = true
    nativeModuleLoadError = message
    sqliteConstructor = null
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

export function tryGetWriteDb(): SqliteDatabase | null {
  if (nativeModuleUnavailable) return null
  if (writeDb) return writeDb

  const Database = loadSqliteDatabase()
  if (!Database) return null

  try {
    const dbPath = listingsDbPath()
    seedListingsDbIfNeeded(dbPath)
    mkdirSync(path.dirname(dbPath), { recursive: true })
    writeDb = openSqliteDb(dbPath)
    initSchema(writeDb)
    lastOpenError = null

    const readPath = listingsReadDbPath()
    if (!existsSync(readPath) && existsSync(dbPath)) {
      publishListingsReadSnapshot()
    } else if (existsSync(readPath)) {
      // Refresh snapshots that predate schema migrations (e.g. goldilocks_*).
      try {
        const probe = openSqliteDb(readPath, true)
        const stale = !listingsTableHasGoldilocksColumns(probe)
        probe.close()
        if (stale) publishListingsReadSnapshot()
      } catch {
        publishListingsReadSnapshot()
      }
    }

    return writeDb
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastOpenError = message
    console.warn('[listings-db] SQLite open failed (will retry) — falling back to live RETS:', message)
    writeDb = null
    return null
  }
}

export function tryGetReadDb(): SqliteDatabase | null {
  if (nativeModuleUnavailable) return null

  const readPath = listingsReadDbPath()
  if (!existsSync(readPath)) {
    return tryGetWriteDb()
  }

  const isUsableReadDb = (database: SqliteDatabase): boolean => {
    try {
      if (!listingsTableHasGoldilocksColumns(database)) return false
      // Cheap probe — catches "database disk image is malformed" held by a stale handle.
      database.prepare('SELECT 1 FROM listings LIMIT 1').get()
      return true
    } catch {
      return false
    }
  }

  if (readDb && readDb !== writeDb) {
    if (isUsableReadDb(readDb)) return readDb
    console.warn(
      '[listings-db] read snapshot unusable — falling back to write db and republishing',
    )
    resetReadDbConnection()
    try {
      publishListingsReadSnapshot()
    } catch {
      /* ignore */
    }
    return tryGetWriteDb()
  }

  try {
    readDb = openSqliteDb(readPath, true)
    if (!isUsableReadDb(readDb)) {
      console.warn(
        '[listings-db] read snapshot unusable — falling back to write db and republishing',
      )
      resetReadDbConnection()
      try {
        publishListingsReadSnapshot()
      } catch {
        /* ignore */
      }
      return tryGetWriteDb()
    }
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
    const runtime = describeListingsDbRuntime()
    const hints: string[] = []
    if (runtime.nativeModuleError) hints.push(runtime.nativeModuleError)
    if (runtime.lastOpenError) hints.push(runtime.lastOpenError)
    const suffix = hints.length > 0 ? ` (${hints.join('; ')})` : ''
    throw new Error(`Listings DB unavailable in this runtime${suffix}`)
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

    CREATE INDEX IF NOT EXISTS idx_listings_modification
      ON listings (modification_timestamp);

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

    CREATE TABLE IF NOT EXISTS listing_relations (
      subject_id TEXT NOT NULL,
      related_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      rank INTEGER NOT NULL,
      score REAL,
      payload TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (subject_id, relation, related_id)
    );

    CREATE INDEX IF NOT EXISTS idx_listing_relations_subject
      ON listing_relations (subject_id, relation, rank);

    CREATE TABLE IF NOT EXISTS listing_edge_scores (
      mls_id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      edge_score REAL NOT NULL,
      breakdown_json TEXT NOT NULL,
      metadata_snapshot TEXT NOT NULL,
      computed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listing_edge_scores_listing_id
      ON listing_edge_scores (listing_id);

    CREATE TABLE IF NOT EXISTS listing_superlatives (
      listing_id TEXT PRIMARY KEY,
      mls_id TEXT NOT NULL,
      superlatives_json TEXT NOT NULL,
      computed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listing_superlatives_mls_id
      ON listing_superlatives (mls_id);

    CREATE TABLE IF NOT EXISTS town_property_addresses (
      property_key TEXT PRIMARY KEY,
      parcel_number TEXT,
      town TEXT NOT NULL,
      street TEXT NOT NULL,
      unit TEXT,
      zip TEXT,
      address_full TEXT NOT NULL,
      address_norm TEXT NOT NULL,
      listing_id TEXT,
      mls_id TEXT,
      source TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tpa_town_norm
      ON town_property_addresses (town, address_norm);

    CREATE INDEX IF NOT EXISTS idx_tpa_address_norm
      ON town_property_addresses (address_norm);

    CREATE INDEX IF NOT EXISTS idx_tpa_parcel
      ON town_property_addresses (parcel_number)
      WHERE parcel_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_listing_id
      ON town_property_addresses (listing_id)
      WHERE listing_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_search
      ON town_property_addresses (address_full COLLATE NOCASE);
  `)

  ensureListingsColumns(database)
  ensureIfEstimateColumns(database)
}

/** Bootstrap schema on a fresh SQLite file (Netlify bundle prep, local scripts). */
export function initListingsDbSchema(database: SqliteDatabase): void {
  initSchema(database)
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
  if (!names.has('goldilocks_score')) {
    database.exec('ALTER TABLE listings ADD COLUMN goldilocks_score REAL')
  }
  if (!names.has('goldilocks_breakdown')) {
    database.exec('ALTER TABLE listings ADD COLUMN goldilocks_breakdown TEXT')
  }
  if (!names.has('goldilocks_scored_at')) {
    database.exec('ALTER TABLE listings ADD COLUMN goldilocks_scored_at TEXT')
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
  stats?: SqliteWriteStatsCollector,
): void {
  const { annualAmount, yearLabel } = propertyTaxFromRaw(listing.raw)
  if (annualAmount == null || !yearLabel) return

  const taxYearEnd = parseTaxYearEnd(yearLabel)
  if (taxYearEnd == null) return

  const parcelNumber = parcelNumberFromRaw(listing.raw) ?? listingId

  const existing = database
    .prepare(
      'SELECT 1 FROM listing_tax_history WHERE parcel_number = ? AND tax_year_end = ? LIMIT 1',
    )
    .get(parcelNumber, taxYearEnd)

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

  if (existing) stats?.addUpdated('listing_tax_history', 1)
  else stats?.addInserted('listing_tax_history', 1)
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

export function deleteSyncMeta(key: string): void {
  const database = tryGetWriteDb()
  if (!database) return
  database.prepare('DELETE FROM sync_meta WHERE key = ?').run(key)
}

export function listingRowId(listing: Listing): string {
  return listing.listingKey?.trim() || listing.mlsId?.trim() || ''
}

/** Upsert a single listing row without touching other rows in the town bucket. */
export function upsertListing(
  listing: Listing,
  town: string,
  statusBucket: string,
  stats?: SqliteWriteStatsCollector,
): { upserted: boolean; priceChanged: boolean } {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database) return { upserted: false, priceChanged: false }

  const id = listingRowId(listing)
  if (!id) return { upserted: false, priceChanged: false }

  const existing = database
    .prepare('SELECT price FROM listings WHERE id = ?')
    .get(id) as { price: number | null } | undefined
  const previousPrice = existing?.price ?? null
  const nextPrice = listing.price ?? null
  const priceChanged =
    existing != null &&
    previousPrice != null &&
    nextPrice != null &&
    previousPrice !== nextPrice

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

  if (existing) stats?.addUpdated('listings', 1)
  else stats?.addInserted('listings', 1)

  upsertListingTaxHistory(database, listing, id, syncedAt, stats)

  return { upserted: true, priceChanged }
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
  stats?: SqliteWriteStatsCollector,
): number {
  stats = withRefreshLockStats(stats)
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

  stats?.addQueried('listings', rows.length)

  const syncedAt = new Date().toISOString()
  const seen = new Set<string>()
  const existingIds = new Set(
    (
      database
        .prepare('SELECT id FROM listings WHERE town = ? AND status_bucket = ?')
        .all(town, statusBucket) as { id: string }[]
    ).map((row) => row.id),
  )

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
      if (existingIds.has(id)) stats?.addUpdated('listings', 1)
      else stats?.addInserted('listings', 1)
      upsert.run(listingDbBindValues(listing, town, statusBucket, syncedAt))
      upsertListingTaxHistory(database, listing, id, syncedAt, stats)
    }

    const remove = database.prepare('DELETE FROM listings WHERE id = ?')
    for (const id of existingIds) {
      if (!seen.has(id)) {
        remove.run(id)
        stats?.addDeleted('listings', 1)
        removeListingPhotosFromStore(id)
      }
    }
  })

  tx(rows)
  return seen.size
}

/** Upsert listings without removing rows missing from the batch (incremental sync). */
export function upsertListingsIncremental(
  town: string,
  statusBucket: string,
  listings: Listing[],
  stats?: SqliteWriteStatsCollector,
): { count: number; priceChangedIds: string[] } {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database || listings.length === 0) return { count: 0, priceChangedIds: [] }

  const rows = listings.filter((l) => listingMatchesStatusBucket(l, statusBucket))
  if (rows.length === 0) return { count: 0, priceChangedIds: [] }

  stats?.addQueried('listings', rows.length)

  let count = 0
  const priceChangedIds: string[] = []
  for (const listing of rows) {
    const result = upsertListing(listing, town, statusBucket, stats)
    if (!result.upserted) continue
    count += 1
    if (result.priceChanged) {
      const id = listingRowId(listing)
      if (id) priceChangedIds.push(id)
    }
  }
  return { count, priceChangedIds }
}

export type ListingScoreRow = {
  score: number
  breakdownJson: string | null
  scoredAt: string | null
}

export type ListingEdgeScoreRow = {
  mlsId: string
  listingId: string
  edgeScore: number
  breakdownJson: string
  metadataSnapshot: string
  computedAt: string
}

export type RecentlyUpdatedRow = {
  listing: Listing
  town: string
  modificationTimestamp: string | null
  syncedAt: string
  goldilocksScore: number | null
  goldilocksBreakdown: string | null
  goldilocksScoredAt: string | null
}

/** Persist Goldilocks scores computed during a full reload. */
export function upsertListingScores(
  rows: { id: string; score: number; breakdownJson: string; scoredAt: string }[],
  stats?: SqliteWriteStatsCollector,
): number {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database || rows.length === 0) return 0

  stats?.addQueried('listings', rows.length)

  const stmt = database.prepare(
    `UPDATE listings
     SET goldilocks_score = ?,
         goldilocks_breakdown = ?,
         goldilocks_scored_at = ?
     WHERE id = ?`,
  )
  let updated = 0
  const tx = database.transaction(() => {
    for (const row of rows) {
      const result = stmt.run(row.score, row.breakdownJson, row.scoredAt, row.id)
      updated += result.changes
    }
  })
  tx()
  if (updated > 0) stats?.addUpdated('listings', updated)
  return updated
}

/** Read persisted Goldilocks scores by listing id (mls/listing key). */
export function readListingScoresByIds(
  ids: readonly string[],
): Map<string, ListingScoreRow> {
  const out = new Map<string, ListingScoreRow>()
  const database = tryGetReadDb()
  if (!database || ids.length === 0) return out

  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = database
      .prepare(
        `SELECT id, goldilocks_score, goldilocks_breakdown, goldilocks_scored_at
         FROM listings
         WHERE id IN (${placeholders})
           AND goldilocks_score IS NOT NULL`,
      )
      .all(...chunk) as {
      id: string
      goldilocks_score: number
      goldilocks_breakdown: string | null
      goldilocks_scored_at: string | null
    }[]
    for (const row of rows) {
      out.set(row.id, {
        score: row.goldilocks_score,
        breakdownJson: row.goldilocks_breakdown,
        scoredAt: row.goldilocks_scored_at,
      })
    }
  }
  return out
}

/** Persist weekly metadata edge scores keyed by MLS id. */
export function upsertListingEdgeScores(
  rows: {
    mlsId: string
    listingId: string
    edgeScore: number
    breakdownJson: string
    metadataSnapshot: string
    computedAt: string
  }[],
  stats?: SqliteWriteStatsCollector,
): number {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database || rows.length === 0) return 0

  stats?.addQueried('listing_edge_scores', rows.length)

  const stmt = database.prepare(
    `INSERT INTO listing_edge_scores (
       mls_id, listing_id, edge_score, breakdown_json, metadata_snapshot, computed_at
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(mls_id) DO UPDATE SET
       listing_id = excluded.listing_id,
       edge_score = excluded.edge_score,
       breakdown_json = excluded.breakdown_json,
       metadata_snapshot = excluded.metadata_snapshot,
       computed_at = excluded.computed_at`,
  )
  let updated = 0
  const tx = database.transaction(() => {
    for (const row of rows) {
      stmt.run(
        row.mlsId,
        row.listingId,
        row.edgeScore,
        row.breakdownJson,
        row.metadataSnapshot,
        row.computedAt,
      )
      updated += 1
    }
  })
  tx()
  if (updated > 0) stats?.addUpdated('listing_edge_scores', updated)
  return updated
}

/** Read persisted edge scores by MLS id. */
export function readListingEdgeScoresByMlsIds(
  mlsIds: readonly string[],
): Map<string, ListingEdgeScoreRow> {
  const out = new Map<string, ListingEdgeScoreRow>()
  const database = tryGetReadDb()
  if (!database || mlsIds.length === 0) return out

  const unique = [...new Set(mlsIds.map((id) => id.trim()).filter(Boolean))]
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = database
      .prepare(
        `SELECT mls_id, listing_id, edge_score, breakdown_json, metadata_snapshot, computed_at
         FROM listing_edge_scores
         WHERE mls_id IN (${placeholders})`,
      )
      .all(...chunk) as {
      mls_id: string
      listing_id: string
      edge_score: number
      breakdown_json: string
      metadata_snapshot: string
      computed_at: string
    }[]
    for (const row of rows) {
      out.set(row.mls_id, {
        mlsId: row.mls_id,
        listingId: row.listing_id,
        edgeScore: row.edge_score,
        breakdownJson: row.breakdown_json,
        metadataSnapshot: row.metadata_snapshot,
        computedAt: row.computed_at,
      })
    }
  }
  return out
}

export function readListingEdgeScoreByMlsId(
  mlsId: string,
): ListingEdgeScoreRow | null {
  const id = mlsId.trim()
  if (!id) return null
  return readListingEdgeScoresByMlsIds([id]).get(id) ?? null
}

/** Persist peer-relative listing superlatives keyed by listing id. */
export function upsertListingSuperlatives(
  rows: {
    listingId: string
    mlsId: string
    superlativesJson: string
    computedAt: string
  }[],
  stats?: SqliteWriteStatsCollector,
): number {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database || rows.length === 0) return 0

  stats?.addQueried('listing_superlatives', rows.length)

  const stmt = database.prepare(
    `INSERT INTO listing_superlatives (
       listing_id, mls_id, superlatives_json, computed_at
     ) VALUES (?, ?, ?, ?)
     ON CONFLICT(listing_id) DO UPDATE SET
       mls_id = excluded.mls_id,
       superlatives_json = excluded.superlatives_json,
       computed_at = excluded.computed_at`,
  )
  let updated = 0
  const tx = database.transaction(() => {
    for (const row of rows) {
      stmt.run(row.listingId, row.mlsId, row.superlativesJson, row.computedAt)
      updated += 1
    }
  })
  tx()
  if (updated > 0) stats?.addUpdated('listing_superlatives', updated)
  return updated
}

function parseSuperlativesJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((word): word is string => typeof word === 'string' && word.length > 0)
  } catch {
    return []
  }
}

/** Read cached superlatives by MLS id. */
export function readListingSuperlativesByMlsIds(
  mlsIds: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const database = tryGetReadDb()
  if (!database || mlsIds.length === 0) return out

  const unique = [...new Set(mlsIds.map((id) => id.trim()).filter(Boolean))]
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = database
      .prepare(
        `SELECT mls_id, superlatives_json
         FROM listing_superlatives
         WHERE mls_id IN (${placeholders})`,
      )
      .all(...chunk) as { mls_id: string; superlatives_json: string }[]
    for (const row of rows) {
      const words = parseSuperlativesJson(row.superlatives_json)
      if (words.length > 0) out.set(row.mls_id, words)
    }
  }
  return out
}

/** Read cached superlatives by listing id. */
export function readListingSuperlativesByListingIds(
  ids: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const database = tryGetReadDb()
  if (!database || ids.length === 0) return out

  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = database
      .prepare(
        `SELECT listing_id, superlatives_json
         FROM listing_superlatives
         WHERE listing_id IN (${placeholders})`,
      )
      .all(...chunk) as { listing_id: string; superlatives_json: string }[]
    for (const row of rows) {
      const words = parseSuperlativesJson(row.superlatives_json)
      if (words.length > 0) out.set(row.listing_id, words)
    }
  }
  return out
}

/** Listings ordered by MLS modification time (newest first). */
export function readRecentlyUpdatedListings(options: {
  since?: string | null
  limit?: number
  statusBucket?: string
  town?: string | null
}): RecentlyUpdatedRow[] {
  const database = tryGetReadDb()
  if (!database) return []

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  const statusBucket = options.statusBucket ?? 'Active'
  const since = options.since?.trim() || null
  const town = options.town?.trim() || null

  const conditions = ['status_bucket = ?', 'modification_timestamp IS NOT NULL']
  const bindings: (string | number)[] = [statusBucket]
  if (since) {
    conditions.push('modification_timestamp > ?')
    bindings.push(since)
  }
  if (town) {
    conditions.push('town = ?')
    bindings.push(town)
  }
  bindings.push(limit)

  const sql = `SELECT data, town, modification_timestamp, synced_at,
       goldilocks_score, goldilocks_breakdown, goldilocks_scored_at
       FROM listings
       WHERE ${conditions.join('\n         AND ')}
       ORDER BY modification_timestamp DESC
       LIMIT ?`

  const rows = database.prepare(sql).all(...bindings) as {
    data: string
    town: string
    modification_timestamp: string | null
    synced_at: string
    goldilocks_score: number | null
    goldilocks_breakdown: string | null
    goldilocks_scored_at: string | null
  }[]

  return rows.map((row) => ({
    listing: JSON.parse(row.data) as Listing,
    town: row.town,
    modificationTimestamp: row.modification_timestamp,
    syncedAt: row.synced_at,
    goldilocksScore: row.goldilocks_score,
    goldilocksBreakdown: row.goldilocks_breakdown,
    goldilocksScoredAt: row.goldilocks_scored_at,
  }))
}

export type TownUpdateStat = {
  town: string
  updateCount: number
  latestUpdate: string | null
  latestListingId: string | null
  latestListingAddress: string | null
}

/** Towns ranked by count of listings modified since `since` (default last 24h). */
export function readTownUpdateStats(options: {
  since?: string | null
  statusBucket?: string
} = {}): TownUpdateStat[] {
  const database = tryGetReadDb()
  if (!database) return []

  const statusBucket = options.statusBucket ?? 'Active'
  const since =
    options.since?.trim() ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const rows = database
    .prepare(
      `SELECT
         l.town,
         COUNT(*) AS update_count,
         MAX(l.modification_timestamp) AS latest_update,
         (
           SELECT COALESCE(NULLIF(l2.listing_key, ''), l2.mls_id)
           FROM listings l2
           WHERE l2.town = l.town
             AND l2.status_bucket = ?
             AND l2.modification_timestamp IS NOT NULL
             AND l2.modification_timestamp > ?
           ORDER BY l2.modification_timestamp DESC, l2.id DESC
           LIMIT 1
         ) AS latest_listing_id,
         (
           SELECT COALESCE(
             NULLIF(json_extract(l2.data, '$.address.street'), ''),
             NULLIF(json_extract(l2.data, '$.address.full'), '')
           )
           FROM listings l2
           WHERE l2.town = l.town
             AND l2.status_bucket = ?
             AND l2.modification_timestamp IS NOT NULL
             AND l2.modification_timestamp > ?
             AND json_valid(l2.data) = 1
           ORDER BY l2.modification_timestamp DESC, l2.id DESC
           LIMIT 1
         ) AS latest_listing_address
       FROM listings l
       WHERE l.status_bucket = ?
         AND l.modification_timestamp IS NOT NULL
         AND l.modification_timestamp > ?
       GROUP BY l.town
       ORDER BY update_count DESC, latest_update DESC`,
    )
    .all(statusBucket, since, statusBucket, since, statusBucket, since) as {
      town: string
      update_count: number
      latest_update: string | null
      latest_listing_id: string | null
      latest_listing_address: string | null
    }[]

  return rows.map((row) => ({
    town: row.town,
    updateCount: row.update_count,
    latestUpdate: row.latest_update,
    latestListingId: row.latest_listing_id?.trim() || null,
    latestListingAddress: row.latest_listing_address?.trim() || null,
  }))
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

const LISTING_SEARCH_STATUS_ORDER: Record<string, number> = {
  Active: 0,
  Closed: 1,
  Expired: 2,
}

/** Text search across cached listings (address, MLS id, town, zip). */
export function searchListingsInDbByQuery(
  query: string,
  options: { limit?: number; statusBuckets?: string[] } = {},
): Listing[] {
  const database = tryGetReadDb()
  if (!database) return []

  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50)
  const buckets = options.statusBuckets ?? ['Active', 'Closed', 'Expired']
  if (buckets.length === 0) return []

  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const placeholders = buckets.map(() => '?').join(', ')
  const sql = `SELECT data, status_bucket FROM listings
    WHERE status_bucket IN (${placeholders})
      AND (
        lower(mls_id) LIKE ?
        OR lower(json_extract(data, '$.address.full')) LIKE ?
        OR lower(json_extract(data, '$.address.street')) LIKE ?
        OR lower(json_extract(data, '$.address.city')) LIKE ?
        OR lower(json_extract(data, '$.address.postalCode')) LIKE ?
        OR lower(json_extract(data, '$.propertyType')) LIKE ?
      )
    ORDER BY modification_timestamp DESC
    LIMIT ?`

  const rows = database
    .prepare(sql)
    .all(...buckets, pattern, pattern, pattern, pattern, pattern, pattern, limit * 3) as {
    data: string
    status_bucket: string
  }[]

  const scored: { listing: Listing; score: number }[] = []
  for (const row of rows) {
    const listing = JSON.parse(row.data) as Listing
    const hay = [
      listing.mlsId,
      listing.address.full,
      listing.address.street,
      listing.address.city,
      listing.address.postalCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) continue
    let score = LISTING_SEARCH_STATUS_ORDER[row.status_bucket] ?? 9
    const street = listing.address.street?.toLowerCase() ?? ''
    const full = listing.address.full?.toLowerCase() ?? ''
    if (listing.mlsId.toLowerCase() === q) score -= 30
    else if (street.startsWith(q) || full.startsWith(q)) score -= 20
    else if (street.includes(q) || full.includes(q)) score -= 10
    scored.push({ listing, score })
  }

  scored.sort((a, b) => a.score - b.score)
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const row of scored) {
    const key = row.listing.listingKey || row.listing.mlsId
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row.listing)
    if (out.length >= limit) break
  }
  return out
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

export function recordSyncRun(
  input: {
    startedAt: string
    finishedAt: string
    town: string
    statusBucket: string
    listingsCount: number
    ok: boolean
    error?: string | null
  },
  stats?: SqliteWriteStatsCollector,
): void {
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
  stats?.addInserted('sync_runs', 1)
}

export type SyncRunFailure = {
  town: string
  statusBucket: string
  error: string
  finishedAt: string
  startedAt: string
}

export function readRecentSyncFailures(limit = 5): SyncRunFailure[] {
  const database = tryGetReadDb() ?? tryGetWriteDb()
  if (!database) return []

  const rows = database
    .prepare(
      `SELECT town, status_bucket AS statusBucket, error, finished_at AS finishedAt, started_at AS startedAt
       FROM sync_runs
       WHERE ok = 0 AND error IS NOT NULL AND TRIM(error) != ''
       ORDER BY finished_at DESC
       LIMIT ?`,
    )
    .all(Math.max(1, limit)) as SyncRunFailure[]

  return rows.filter((row) => row.town && row.error)
}

export function getListingsDbStats(): {
  total: number
  byTown: Record<string, number>
  lastFullSync: string | null
  lastFullSyncStarted: string | null
  lastIncrementalSync: string | null
  lastIncrementalSyncStarted: string | null
  lastListingScores: string | null
  lastListingScoresStarted: string | null
  lastListingSuperlatives: string | null
  lastListingSuperlativesStarted: string | null
  lastListingEdgeScores: string | null
  statsCacheEntries: number
  lastStatsCache: string | null
  lastStatsCacheStarted: string | null
  dealOfTheDayCacheEntries: number
  lastDealOfTheDayCache: string | null
  lastDealOfTheDayCacheStarted: string | null
} {
  const empty = {
    total: 0,
    byTown: {} as Record<string, number>,
    lastFullSync: null as string | null,
    lastFullSyncStarted: null as string | null,
    lastIncrementalSync: null as string | null,
    lastIncrementalSyncStarted: null as string | null,
    lastListingScores: null as string | null,
    lastListingScoresStarted: null as string | null,
    lastListingSuperlatives: null as string | null,
    lastListingSuperlativesStarted: null as string | null,
    lastListingEdgeScores: null as string | null,
    statsCacheEntries: 0,
    lastStatsCache: null as string | null,
    lastStatsCacheStarted: null as string | null,
    dealOfTheDayCacheEntries: 0,
    lastDealOfTheDayCache: null as string | null,
    lastDealOfTheDayCacheStarted: null as string | null,
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
    lastFullSyncStarted: getSyncMeta('last_full_sync_started'),
    lastIncrementalSync: getSyncMeta('last_incremental_sync'),
    lastIncrementalSyncStarted: getSyncMeta('last_incremental_sync_started'),
    lastListingScores: getSyncMeta('last_listing_scores'),
    lastListingScoresStarted: getSyncMeta('last_listing_scores_started'),
    lastListingSuperlatives: getSyncMeta('last_listing_superlatives'),
    lastListingSuperlativesStarted: getSyncMeta('last_listing_superlatives_started'),
    lastListingEdgeScores: getSyncMeta('last_listing_edge_scores'),
    statsCacheEntries: (
      writeDatabase.prepare('SELECT COUNT(*) AS count FROM stats_cache').get() as {
        count: number
      }
    ).count,
    lastStatsCache: getSyncMeta('last_stats_cache'),
    lastStatsCacheStarted: getSyncMeta('last_stats_cache_started'),
    dealOfTheDayCacheEntries: (
      writeDatabase
        .prepare(`SELECT COUNT(*) AS count FROM stats_cache WHERE cache_key LIKE 'deal-of-the-day:%'`)
        .get() as { count: number }
    ).count,
    lastDealOfTheDayCache: getSyncMeta('last_deal_of_the_day_cache'),
    lastDealOfTheDayCacheStarted: getSyncMeta('last_deal_of_the_day_cache_started'),
  }
}

/** Newest MLS modification timestamp across Active listings (naive UTC strings). */
export function readLatestListingModificationTimestamp(): string | null {
  const database = tryGetReadDb()
  if (!database) return null
  const row = database
    .prepare(
      `SELECT MAX(modification_timestamp) AS latest
       FROM listings
       WHERE status_bucket = 'Active'
         AND modification_timestamp IS NOT NULL`,
    )
    .get() as { latest: string | null } | undefined
  return row?.latest ?? null
}

export function readStatsCacheRow(key: string): { payload: string; computedAt: string } | null {
  const database = tryGetWriteDb()
  if (!database) return null

  const row = database
    .prepare('SELECT payload, computed_at AS computedAt FROM stats_cache WHERE cache_key = ?')
    .get(key) as { payload: string; computedAt: string } | undefined
  return row ?? null
}

export function writeStatsCacheRow(
  key: string,
  payload: unknown,
  stats?: SqliteWriteStatsCollector,
): void {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database) return

  const existing = database
    .prepare('SELECT 1 FROM stats_cache WHERE cache_key = ? LIMIT 1')
    .get(key)

  database
    .prepare(
      `INSERT INTO stats_cache (cache_key, payload, computed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         computed_at = excluded.computed_at`,
    )
    .run(key, JSON.stringify(payload), new Date().toISOString())

  if (existing) stats?.addUpdated('stats_cache', 1)
  else stats?.addInserted('stats_cache', 1)
}

export function clearStatsCache(stats?: SqliteWriteStatsCollector): number {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database) return 0

  // Keep Last-good Latest + Deal of Day caches across hourly stats rebuilds.
  // Full sync (~5am) refreshes feeds via warmLatestTownFeedsDeferred after this.
  const result = database
    .prepare(
      `DELETE FROM stats_cache
       WHERE cache_key NOT LIKE 'deal-of-the-day:%'
         AND cache_key NOT LIKE 'latest-town-feed:%'
         AND cache_key NOT LIKE 'latest-feed:%'`,
    )
    .run()
  if (result.changes > 0) stats?.addDeleted('stats_cache', result.changes)
  return result.changes
}

export function clearCacheByPrefix(prefix: string, stats?: SqliteWriteStatsCollector): number {
  stats = withRefreshLockStats(stats)
  const database = tryGetWriteDb()
  if (!database) return 0

  const result = database
    .prepare('DELETE FROM stats_cache WHERE cache_key LIKE ?')
    .run(`${prefix}%`)
  if (result.changes > 0) stats?.addDeleted('stats_cache', result.changes)
  return result.changes
}

export type ListingTaxMetaRow = {
  listingId: string
  mlsId: string
  parcelNumber: string | null
  propertyTaxYear: string | null
}

/** Lightweight tax fields for property-tax history without parsing full listing JSON. */
export function readListingTaxMetaFromDb(id: string): ListingTaxMetaRow | null {
  const database = tryGetReadDb()
  if (!database) return null

  const row = database
    .prepare(
      `SELECT
         id AS listingId,
         mls_id AS mlsId,
         NULLIF(TRIM(json_extract(data, '$.raw.ParcelNumber')), '') AS parcelNumber,
         COALESCE(
           NULLIF(TRIM(property_tax_year), ''),
           NULLIF(TRIM(json_extract(data, '$.raw.TaxYear')), ''),
           NULLIF(TRIM(json_extract(data, '$.propertyTaxYear')), '')
         ) AS propertyTaxYear
       FROM listings
       WHERE id = ? OR mls_id = ? OR listing_key = ?
       LIMIT 1`,
    )
    .get(id, id, id) as ListingTaxMetaRow | undefined

  return row ?? null
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

export type ListingRelationKind =
  | 'comp_sold'
  | 'comp_active'
  | 'rental_sold'
  | 'rental_active'

export type ListingRelationRow = {
  subjectId: string
  relatedId: string
  relation: ListingRelationKind
  rank: number
  score: number | null
  payload: string
  computedAt: string
}

export function replaceListingRelationsForSubject(
  subjectId: string,
  relations: ListingRelationKind[],
  rows: ListingRelationRow[],
): void {
  const database = tryGetWriteDb()
  const id = subjectId.trim()
  if (!database || !id || relations.length === 0) return

  const del = database.prepare(
    `DELETE FROM listing_relations WHERE subject_id = ? AND relation = ?`,
  )
  const ins = database.prepare(
    `INSERT INTO listing_relations (
       subject_id, related_id, relation, rank, score, payload, computed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  const tx = database.transaction(() => {
    for (const relation of relations) {
      del.run(id, relation)
    }
    for (const row of rows) {
      ins.run(
        row.subjectId,
        row.relatedId,
        row.relation,
        row.rank,
        row.score,
        row.payload,
        row.computedAt,
      )
    }
  })
  tx()
}

export function readListingRelations(
  subjectId: string,
  relations: readonly ListingRelationKind[],
): ListingRelationRow[] {
  const database = tryGetReadDb()
  const id = subjectId.trim()
  if (!database || !id || relations.length === 0) return []

  const placeholders = relations.map(() => '?').join(', ')
  const rows = database
    .prepare(
      `SELECT
         subject_id AS subjectId,
         related_id AS relatedId,
         relation,
         rank,
         score,
         payload,
         computed_at AS computedAt
       FROM listing_relations
       WHERE subject_id = ?
         AND relation IN (${placeholders})
       ORDER BY relation ASC, rank ASC`,
    )
    .all(id, ...relations) as ListingRelationRow[]

  return rows
}

export function deleteListingRelations(subjectId: string): void {
  const database = tryGetWriteDb()
  const id = subjectId.trim()
  if (!database || !id) return
  database.prepare('DELETE FROM listing_relations WHERE subject_id = ?').run(id)
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
  firstStoredListingPhotoIndex,
  listStoredListingPhotoIndices,
  listingPhotoStorageSpan,
  readListingPhotoBlob,
  upsertListingPhotoBlob,
} from '@/lib/listing-photos-db'
