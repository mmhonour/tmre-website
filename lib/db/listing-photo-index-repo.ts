import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'

/**
 * Metadata-only index for listing photos whose bytes live in Cloudflare R2.
 * See db/migrations/0002_listing_photo_index.sql.
 *
 * cache_id = listingKey || mlsId (lib/listing-photo-store.ts listingPhotoCacheId()).
 */

export type PhotoIndexRow = {
  contentType: string
  byteLength: number
  syncedAt: string
}

function tsToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export async function upsertListingPhotoIndexRow(
  cacheId: string,
  photoIndex: number,
  contentType: string,
  byteLength: number,
): Promise<void> {
  const id = cacheId.trim()
  if (!id || photoIndex < 0 || byteLength < 100) return
  await query(
    `INSERT INTO listing_photo_index (cache_id, photo_index, content_type, byte_length, synced_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (cache_id, photo_index) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       byte_length = EXCLUDED.byte_length,
       synced_at = EXCLUDED.synced_at`,
    [id, photoIndex, contentType || 'image/jpeg', byteLength],
  )
}

export async function readListingPhotoIndexRow(
  cacheId: string,
  photoIndex: number,
): Promise<PhotoIndexRow | null> {
  const id = cacheId.trim()
  if (!id || photoIndex < 0) return null
  const row = await queryOne<{
    content_type: string
    byte_length: number
    synced_at: Date | string
  }>(
    `SELECT content_type, byte_length, synced_at
     FROM listing_photo_index
     WHERE cache_id = $1 AND photo_index = $2`,
    [id, photoIndex],
  )
  if (!row) return null
  return {
    contentType: row.content_type || 'image/jpeg',
    byteLength: row.byte_length,
    syncedAt: tsToIso(row.synced_at),
  }
}

/** Stored photo indices for one listing, ascending. */
export async function listListingPhotoIndicesFromDb(
  cacheId: string,
): Promise<number[]> {
  const id = cacheId.trim()
  if (!id) return []
  const rows = await query<{ photo_index: number }>(
    `SELECT photo_index
     FROM listing_photo_index
     WHERE cache_id = $1 AND byte_length >= 100
     ORDER BY photo_index ASC`,
    [id],
  )
  return rows.map((row) => row.photo_index)
}

export async function firstStoredListingPhotoIndexFromDb(
  cacheId: string,
): Promise<number | null> {
  const id = cacheId.trim()
  if (!id) return null
  const row = await queryOne<{ photo_index: number }>(
    `SELECT photo_index
     FROM listing_photo_index
     WHERE cache_id = $1 AND byte_length >= 100
     ORDER BY photo_index ASC
     LIMIT 1`,
    [id],
  )
  return row ? row.photo_index : null
}

/** Highest stored index + 1 (0 when none). */
export async function listingPhotoStorageSpanFromDb(
  cacheId: string,
): Promise<number> {
  const id = cacheId.trim()
  if (!id) return 0
  const row = await queryOne<{ max_index: number | null }>(
    `SELECT MAX(photo_index) AS max_index
     FROM listing_photo_index
     WHERE cache_id = $1`,
    [id],
  )
  if (row?.max_index == null || row.max_index < 0) return 0
  return row.max_index + 1
}

export async function countFreshListingPhotosFromDb(
  cacheId: string,
  expectedCount: number,
  freshAfterIso: string,
): Promise<number> {
  const id = cacheId.trim()
  if (!id || expectedCount <= 0) return 0
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM listing_photo_index
     WHERE cache_id = $1
       AND photo_index >= 0
       AND photo_index < $2
       AND synced_at >= $3::timestamptz`,
    [id, expectedCount, freshAfterIso],
  )
  return row ? Number(row.count) : 0
}

export async function deleteListingPhotoIndexRows(cacheId: string): Promise<void> {
  const id = cacheId.trim()
  if (!id) return
  await query('DELETE FROM listing_photo_index WHERE cache_id = $1', [id])
}
