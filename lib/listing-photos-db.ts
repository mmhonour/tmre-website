import 'server-only'

import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

type SqliteDatabase = import('better-sqlite3').Database

let photosDb: SqliteDatabase | null = null
let photosDbDisabled = false
let migrationAttempted = false

type SqliteConstructor = new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }) => SqliteDatabase

function loadSqliteDatabaseConstructor(): SqliteConstructor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3') as SqliteConstructor
  } catch {
    return null
  }
}

function listingsDbPathForMigration(): string {
  if (process.env.LISTINGS_DB_PATH?.trim()) {
    return process.env.LISTINGS_DB_PATH.trim()
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    return '/tmp/listings.db'
  }
  return path.join(process.cwd(), 'data', 'listings.db')
}

export function listingPhotosDbPath(): string {
  if (process.env.LISTING_PHOTOS_DB_PATH?.trim()) {
    return process.env.LISTING_PHOTOS_DB_PATH.trim()
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    return '/tmp/listing-photos.db'
  }
  return path.join(process.cwd(), 'data', 'listing-photos.db')
}

function initPhotosSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS listing_photos (
      mls_id TEXT NOT NULL,
      photo_index INTEGER NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'image/jpeg',
      byte_length INTEGER NOT NULL,
      data BLOB NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (mls_id, photo_index)
    );

    CREATE INDEX IF NOT EXISTS idx_listing_photos_mls_id
      ON listing_photos (mls_id);
  `)
}

function migratePhotosFromListingsDb(database: SqliteDatabase): void {
  if (migrationAttempted) return
  migrationAttempted = true

  const row = database.prepare('SELECT COUNT(*) AS count FROM listing_photos').get() as {
    count: number
  }
  if ((row?.count ?? 0) > 0) return

  const listingsPath = listingsDbPathForMigration()
  if (!existsSync(listingsPath)) return

  try {
    database.exec(`ATTACH DATABASE '${listingsPath.replace(/'/g, "''")}' AS listings_src`)
    const srcExists = database
      .prepare(
        `SELECT name FROM listings_src.sqlite_master
         WHERE type = 'table' AND name = 'listing_photos'`,
      )
      .get()
    if (!srcExists) {
      database.exec('DETACH DATABASE listings_src')
      return
    }
    database.exec(`
      INSERT INTO listing_photos (
        mls_id, photo_index, content_type, byte_length, data, synced_at
      )
      SELECT mls_id, photo_index, content_type, byte_length, data, synced_at
      FROM listings_src.listing_photos
    `)
    database.exec('DETACH DATABASE listings_src')
    const migrated = database.prepare('SELECT COUNT(*) AS count FROM listing_photos').get() as {
      count: number
    }
    if ((migrated?.count ?? 0) > 0) {
      console.info(`[listing-photos-db] migrated ${migrated.count} photo rows from listings.db`)
    }
  } catch (err) {
    try {
      database.exec('DETACH DATABASE listings_src')
    } catch {
      /* ignore */
    }
    console.warn('[listing-photos-db] migration from listings.db skipped:', err)
  }
}

export function tryGetListingPhotosDb(): SqliteDatabase | null {
  if (photosDbDisabled) return null
  if (photosDb) return photosDb

  const Database = loadSqliteDatabaseConstructor()
  if (!Database) {
    photosDbDisabled = true
    return null
  }

  try {
    const dbPath = listingPhotosDbPath()
    mkdirSync(path.dirname(dbPath), { recursive: true })
    photosDb = new Database(dbPath)
    photosDb.pragma('journal_mode = WAL')
    photosDb.pragma('busy_timeout = 5000')
    initPhotosSchema(photosDb)
    migratePhotosFromListingsDb(photosDb)
    return photosDb
  } catch (err) {
    if (!photosDbDisabled) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[listing-photos-db] open failed:', message)
    }
    photosDbDisabled = true
    photosDb = null
    return null
  }
}

export type ListingPhotoBlobRow = {
  data: Buffer
  contentType: string
  byteLength: number
  syncedAt: string
}

export function readListingPhotoBlob(
  mlsId: string,
  photoIndex: number,
): ListingPhotoBlobRow | null {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id || photoIndex < 0) return null

  const row = database
    .prepare(
      `SELECT data, content_type AS contentType, byte_length AS byteLength, synced_at AS syncedAt
       FROM listing_photos
       WHERE mls_id = ? AND photo_index = ?`,
    )
    .get(id, photoIndex) as
    | {
        data: Buffer
        contentType: string
        byteLength: number
        syncedAt: string
      }
    | undefined

  if (!row?.data || row.data.length < 100) return null
  return {
    data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data),
    contentType: row.contentType || 'image/jpeg',
    byteLength: row.byteLength,
    syncedAt: row.syncedAt,
  }
}

export function countFreshListingPhotos(
  mlsId: string,
  expectedCount: number,
  freshAfterIso: string,
): number {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id || expectedCount <= 0) return 0
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count FROM listing_photos
       WHERE mls_id = ? AND photo_index >= 0 AND photo_index < ? AND synced_at >= ?`,
    )
    .get(id, expectedCount, freshAfterIso) as { count: number }
  return row?.count ?? 0
}

export function countListingPhotos(mlsId: string): number {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id) return 0
  const row = database
    .prepare('SELECT COUNT(*) AS count FROM listing_photos WHERE mls_id = ?')
    .get(id) as { count: number }
  return row?.count ?? 0
}

/** Stored photo indices with a real payload (empty RETS slots are never written). */
export function listStoredListingPhotoIndices(mlsId: string): number[] {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id) return []
  const rows = database
    .prepare(
      `SELECT photo_index AS photoIndex
       FROM listing_photos
       WHERE mls_id = ? AND byte_length >= 100
       ORDER BY photo_index ASC`,
    )
    .all(id) as { photoIndex: number }[]
  return rows.map((row) => row.photoIndex)
}

export function firstStoredListingPhotoIndex(mlsId: string): number | null {
  const indices = listStoredListingPhotoIndices(mlsId)
  return indices.length > 0 ? indices[0]! : null
}

export function listingPhotoStorageSpan(mlsId: string): number {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id) return 0
  const row = database
    .prepare('SELECT MAX(photo_index) AS maxIndex FROM listing_photos WHERE mls_id = ?')
    .get(id) as { maxIndex: number | null } | undefined
  if (row?.maxIndex == null || row.maxIndex < 0) return 0
  return row.maxIndex + 1
}

export function upsertListingPhotoBlob(
  mlsId: string,
  photoIndex: number,
  data: Buffer,
  contentType = 'image/jpeg',
): void {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id || photoIndex < 0 || data.length < 100) return

  const syncedAt = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO listing_photos (
        mls_id, photo_index, content_type, byte_length, data, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(mls_id, photo_index) DO UPDATE SET
        content_type = excluded.content_type,
        byte_length = excluded.byte_length,
        data = excluded.data,
        synced_at = excluded.synced_at`,
    )
    .run(id, photoIndex, contentType, data.length, data, syncedAt)
}

export function deleteListingPhotos(mlsId: string): void {
  const database = tryGetListingPhotosDb()
  const id = mlsId.trim()
  if (!database || !id) return
  database.prepare('DELETE FROM listing_photos WHERE mls_id = ?').run(id)
}
