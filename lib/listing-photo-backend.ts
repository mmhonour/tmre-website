import 'server-only'

import pg from 'pg'
import {
  countFreshListingPhotosFromDb,
  deleteListingPhotoIndexRows,
  firstStoredListingPhotoIndexFromDb,
  listListingPhotoIndicesForCacheIds,
  listListingPhotoIndicesFromDb,
  listingPhotoStorageSpanFromDb,
  readListingPhotoIndexRow,
  upsertListingPhotoIndexRow,
} from '@/lib/db/listing-photo-index-repo'
import {
  isListingPhotoIndexConnectionError,
  listListingPhotoIndicesForCacheIdsWithQuery,
  listingPhotoGapScanUsesSidecarIndex,
} from '@/lib/listing-photo-index-coverage'
import { shouldUseSslForDbUrl } from '@/lib/script-postgres-target'
import {
  countFreshListingPhotos as sqliteCountFresh,
  deleteListingPhotos as sqliteDelete,
  firstStoredListingPhotoIndex as sqliteFirstIndex,
  listStoredListingPhotoIndices as sqliteListIndices,
  listingPhotoStorageSpan as sqliteSpan,
  readListingPhotoBlob as sqliteReadBlob,
  upsertListingPhotoBlob as sqliteUpsertBlob,
} from '@/lib/listing-photos-db'
import { listingPhotoCardCacheId } from '@/lib/listing-photo-quality'
import {
  deleteR2ListingPhotos,
  getR2ListingPhoto,
  isR2PhotoStoreConfigured,
  putR2ListingPhoto,
} from '@/lib/r2-photo-store'

/**
 * Single async facade over the two photo backends:
 *   * R2 (bytes) + Postgres listing_photo_index (metadata) — when R2 is configured.
 *   * SQLite listing-photos.db — legacy fallback when R2 env vars are absent.
 *
 * Consumers await these regardless of backend; the SQLite calls are synchronous
 * under the hood but wrapped so the call sites are backend-agnostic.
 */

export function photoBackendUsesR2(): boolean {
  return isR2PhotoStoreConfigured()
}

export type PhotoBytes = {
  data: Buffer
  contentType: string
  syncedAt: string
}

export type PhotoMeta = {
  contentType: string
  byteLength: number
  syncedAt: string
}

let indexSidecarPool: pg.Pool | null = null

function listingPhotoIndexSidecarUrl(): string {
  return process.env.LISTING_PHOTO_INDEX_URL?.trim() || ''
}

function listingPhotoIndexSidecarIsDistinct(): boolean {
  return listingPhotoGapScanUsesSidecarIndex({
    databaseUrl: process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL,
    indexUrl: listingPhotoIndexSidecarUrl(),
  })
}

/**
 * Pool, not a long-lived Client. An idle Neon sidecar Client emits
 * `Connection terminated unexpectedly` with no listener and kills the CLI
 * (Ridgefield Closed 96/3579 at 13:43 ET while printing 0 new).
 */
function getListingPhotoIndexSidecarPool(): pg.Pool | null {
  if (!listingPhotoIndexSidecarIsDistinct()) return null
  if (indexSidecarPool) return indexSidecarPool
  const url = listingPhotoIndexSidecarUrl()
  if (!url) return null
  const pool = new pg.Pool({
    connectionString: url,
    ssl: shouldUseSslForDbUrl(url) ? { rejectUnauthorized: false } : false,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', (err) => {
    console.warn(
      '[listing-photo-backend] index sidecar idle connection dropped — will reconnect',
      err instanceof Error ? err.message : err,
    )
  })
  indexSidecarPool = pool
  return pool
}

async function queryListingPhotoIndexSidecar(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult> {
  const pool = getListingPhotoIndexSidecarPool()
  if (!pool) {
    throw new Error('listing photo index sidecar is not configured')
  }
  try {
    return await pool.query(text, params)
  } catch (err) {
    if (!isListingPhotoIndexConnectionError(err)) throw err
    console.warn(
      '[listing-photo-backend] index sidecar query dropped — retrying once',
      err instanceof Error ? err.message : err,
    )
    return await pool.query(text, params)
  }
}

/**
 * `--all` gap scan coverage. When listings are localhost and the CLI set
 * LISTING_PHOTO_INDEX_URL to Neon, read that sidecar — DATABASE_URL's index
 * does not have last night's Closed fills.
 */
export async function listListingPhotoCoverageForBackfill(
  cacheIds: readonly string[],
  options?: { onChunk?: (done: number, total: number) => void },
): Promise<Map<string, number[]>> {
  const pool = getListingPhotoIndexSidecarPool()
  if (!pool) return listListingPhotoIndicesForCacheIds(cacheIds, options)
  return listListingPhotoIndicesForCacheIdsWithQuery(
    cacheIds,
    async (text, params) => {
      const result = await queryListingPhotoIndexSidecar(
        text,
        params as unknown[],
      )
      return result.rows
    },
    options?.onChunk,
  )
}

async function upsertListingPhotoIndexSidecar(
  cacheId: string,
  photoIndex: number,
  contentType: string,
  byteLength: number,
): Promise<void> {
  if (!getListingPhotoIndexSidecarPool()) return
  if (!cacheId || photoIndex < 0 || byteLength < 100) return
  await queryListingPhotoIndexSidecar(
    `INSERT INTO listing_photo_index (cache_id, photo_index, content_type, byte_length, synced_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (cache_id, photo_index) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       byte_length = EXCLUDED.byte_length,
       synced_at = EXCLUDED.synced_at`,
    [cacheId, photoIndex, contentType || 'image/jpeg', byteLength],
  )
}

/** Persist one photo blob + its index metadata. */
export async function storeListingPhoto(
  cacheId: string,
  photoIndex: number,
  data: Buffer,
  contentType = 'image/jpeg',
): Promise<void> {
  if (photoBackendUsesR2()) {
    const ok = await putR2ListingPhoto(cacheId, photoIndex, data, contentType)
    if (ok) {
      await upsertListingPhotoIndexRow(cacheId, photoIndex, contentType, data.length)
      await upsertListingPhotoIndexSidecar(
        cacheId,
        photoIndex,
        contentType,
        data.length,
      )
    }
    return
  }
  sqliteUpsertBlob(cacheId, photoIndex, data, contentType)
}

/** Read one photo's bytes (R2 object or SQLite blob), or null when missing. */
export async function readListingPhotoBytes(
  cacheId: string,
  photoIndex: number,
): Promise<PhotoBytes | null> {
  if (photoBackendUsesR2()) {
    try {
      const fromR2 = await getR2ListingPhoto(cacheId, photoIndex)
      if (fromR2) return fromR2
    } catch (err) {
      // R2 outage / bad credentials — fall through to local SQLite so dev and
      // degraded prod can still serve previously synced thumbs.
      console.warn(
        '[listing-photo-backend] R2 read failed; trying SQLite',
        cacheId,
        photoIndex,
        err instanceof Error ? err.message : err,
      )
    }
    // Local SQLite often still has older warm caches (especially in dev).
    const sqliteRow = sqliteReadBlob(cacheId, photoIndex)
    if (sqliteRow) {
      return {
        data: sqliteRow.data,
        contentType: sqliteRow.contentType,
        syncedAt: sqliteRow.syncedAt,
      }
    }
    return null
  }
  const row = sqliteReadBlob(cacheId, photoIndex)
  if (!row) return null
  return { data: row.data, contentType: row.contentType, syncedAt: row.syncedAt }
}

/**
 * R2 already has the object, Neon does not — write the index row.
 * Returns true when a missing/thin row was healed. Does not copy SQLite.
 */
export async function ensureListingPhotoIndexFromR2(
  cacheId: string,
  photoIndex: number,
): Promise<boolean> {
  if (!photoBackendUsesR2()) return false
  const existing = await readListingPhotoIndexRow(cacheId, photoIndex)
  if (existing && existing.byteLength >= 100) return false
  const fromR2 = await getR2ListingPhoto(cacheId, photoIndex)
  if (!fromR2 || fromR2.data.length < 100) return false
  await upsertListingPhotoIndexRow(
    cacheId,
    photoIndex,
    fromR2.contentType,
    fromR2.data.length,
  )
  return true
}

/** Read one photo's metadata WITHOUT fetching bytes (freshness/skip checks). */
export async function readListingPhotoMeta(
  cacheId: string,
  photoIndex: number,
): Promise<PhotoMeta | null> {
  if (photoBackendUsesR2()) {
    return readListingPhotoIndexRow(cacheId, photoIndex)
  }
  const row = sqliteReadBlob(cacheId, photoIndex)
  if (!row) return null
  return {
    contentType: row.contentType,
    byteLength: row.byteLength,
    syncedAt: row.syncedAt,
  }
}

export async function listStoredListingPhotoIndicesAsync(
  cacheId: string,
): Promise<number[]> {
  if (photoBackendUsesR2()) return listListingPhotoIndicesFromDb(cacheId)
  return sqliteListIndices(cacheId)
}

export async function firstStoredListingPhotoIndexAsync(
  cacheId: string,
): Promise<number | null> {
  if (photoBackendUsesR2()) return firstStoredListingPhotoIndexFromDb(cacheId)
  return sqliteFirstIndex(cacheId)
}

export async function listingPhotoStorageSpanAsync(
  cacheId: string,
): Promise<number> {
  if (photoBackendUsesR2()) return listingPhotoStorageSpanFromDb(cacheId)
  return sqliteSpan(cacheId)
}

export async function countFreshListingPhotosAsync(
  cacheId: string,
  expectedCount: number,
  freshAfterIso: string,
): Promise<number> {
  if (photoBackendUsesR2()) {
    return countFreshListingPhotosFromDb(cacheId, expectedCount, freshAfterIso)
  }
  return sqliteCountFresh(cacheId, expectedCount, freshAfterIso)
}

export async function deleteListingPhotosAsync(cacheId: string): Promise<void> {
  const ids = [...new Set([cacheId, listingPhotoCardCacheId(cacheId)].filter(Boolean))]
  for (const id of ids) {
    if (photoBackendUsesR2()) {
      await deleteR2ListingPhotos(id)
      await deleteListingPhotoIndexRows(id)
    } else {
      sqliteDelete(id)
    }
  }
}
