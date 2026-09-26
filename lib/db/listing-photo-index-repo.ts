import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import { listListingPhotoIndicesForCacheIdsWithQuery } from '@/lib/listing-photo-index-coverage'
import {
  LISTING_PHOTO_SLOT_CAP,
  SHOWCASE_HERO_PHOTO_SLOTS,
} from '@/lib/hero-photo-inventory-backfill-shared'

/** Match upsertListingPhotoIndexRow — ignore junk / empty objects. */
const HERO_SLOT_INDEX_MIN_BYTES = 100

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

/**
 * Indexed slots (`byte_length >= 100`) for many cache ids.
 * Listings with no index rows are omitted from the map (treat as empty).
 * CLI `--all` gap scan uses listListingPhotoCoverageForBackfill so a localhost
 * DATABASE_URL still reads the Neon sidecar.
 */
export async function listListingPhotoIndicesForCacheIds(
  cacheIds: readonly string[],
  options?: { onChunk?: (done: number, total: number) => void },
): Promise<Map<string, number[]>> {
  return listListingPhotoIndicesForCacheIdsWithQuery(
    cacheIds,
    (text, params) => query(text, params),
    options?.onChunk,
  )
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

/**
 * Active listings in one town whose first six hero slots are not in the index.
 * Size is not a completion gate — vintage MLS "full" JPEGs can be under 80KB.
 * `cache_id` matches `listingPhotoCacheId` (listing_key, else mls_id).
 */
export async function listActiveMlsIdsMissingShowcaseHeroes(options: {
  town: string
  afterMlsId?: string
  limit: number
}): Promise<string[]> {
  const town = options.town.trim()
  const limit = Math.max(1, Math.min(Math.round(options.limit), 40))
  if (!town) return []
  const after = options.afterMlsId?.trim() ?? ''
  const rows = await query<{ mls_id: string }>(
    `SELECT l.mls_id
       FROM listings l
      WHERE l.status_bucket = 'Active'
        AND l.town = $1
        AND COALESCE(l.photo_count, 0) > 0
        AND ($2 = '' OR l.mls_id > $2)
        AND (
          SELECT COUNT(*)::int
            FROM listing_photo_index i
           WHERE i.cache_id = COALESCE(NULLIF(BTRIM(l.listing_key), ''), l.mls_id)
             AND i.photo_index >= 0
             AND i.photo_index < LEAST($4, l.photo_count)
             AND i.byte_length >= $5
        ) < LEAST($4, l.photo_count)
      ORDER BY l.mls_id
      LIMIT $3`,
    [town, after, limit, SHOWCASE_HERO_PHOTO_SLOTS, HERO_SLOT_INDEX_MIN_BYTES],
  )
  return rows.map((row) => row.mls_id).filter((id) => id.trim().length > 0)
}

function missingIndexedSlotsSql(alias = 'l'): string {
  return `(
          SELECT COUNT(*)::int
            FROM listing_photo_index i
           WHERE i.cache_id = COALESCE(NULLIF(BTRIM(${alias}.listing_key), ''), ${alias}.mls_id)
             AND i.photo_index >= 0
             AND i.photo_index < LEAST($1, ${alias}.photo_count)
             AND i.byte_length >= $2
        ) < LEAST($1, ${alias}.photo_count)`
}

export async function countActiveShowcaseHeroCoverage(): Promise<{
  withPhotos: number
  missing: number
}> {
  const row = await queryOne<{ with_photos: number; missing: number }>(
    `SELECT
        COUNT(*) FILTER (WHERE COALESCE(l.photo_count, 0) > 0)::int AS with_photos,
        COUNT(*) FILTER (
          WHERE COALESCE(l.photo_count, 0) > 0
            AND ${missingIndexedSlotsSql('l')}
        )::int AS missing
       FROM listings l
      WHERE l.status_bucket = 'Active'`,
    [SHOWCASE_HERO_PHOTO_SLOTS, HERO_SLOT_INDEX_MIN_BYTES],
  )
  return {
    withPhotos: row?.with_photos ?? 0,
    missing: row?.missing ?? 0,
  }
}

/** Oldest Active gaps first — they have been waiting the longest. */
export async function listOldestActiveMlsIdsMissingShowcaseHeroes(
  limit: number,
  options?: { excludeMlsIds?: readonly string[] },
): Promise<string[]> {
  const cap = Math.max(1, Math.min(Math.round(limit), 40))
  const exclude = [
    ...new Set(
      (options?.excludeMlsIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ]
  const rows = await query<{ mls_id: string }>(
    `SELECT l.mls_id
       FROM listings l
      WHERE l.status_bucket = 'Active'
        AND COALESCE(l.photo_count, 0) > 0
        AND ${missingIndexedSlotsSql('l')}
        AND NOT (l.mls_id = ANY($4::text[]))
      ORDER BY l.list_date ASC NULLS LAST, l.mls_id ASC
      LIMIT $3`,
    [SHOWCASE_HERO_PHOTO_SLOTS, HERO_SLOT_INDEX_MIN_BYTES, cap, exclude],
  )
  return rows.map((row) => row.mls_id).filter((id) => id.trim().length > 0)
}

/**
 * Any-status listings whose photo_count slots are not all in the index
 * (capped at LISTING_PHOTO_SLOT_CAP). Size is not a completion gate.
 */
export async function countListingPhotoCoverage(): Promise<{
  withPhotos: number
  missing: number
}> {
  const row = await queryOne<{ with_photos: number; missing: number }>(
    `SELECT
        COUNT(*) FILTER (WHERE COALESCE(l.photo_count, 0) > 0)::int AS with_photos,
        COUNT(*) FILTER (
          WHERE COALESCE(l.photo_count, 0) > 0
            AND ${missingIndexedSlotsSql('l')}
        )::int AS missing
       FROM listings l`,
    [LISTING_PHOTO_SLOT_CAP, HERO_SLOT_INDEX_MIN_BYTES],
  )
  return {
    withPhotos: row?.with_photos ?? 0,
    missing: row?.missing ?? 0,
  }
}

/**
 * Active leftovers first (live new listings), then Closed/Expired.
 * Newest `list_date` first so Media/RETS still has bytes and the laptop
 * Closed CLI is not competing for the same oldest galleries.
 */
export async function listNewestMlsIdsMissingPhotos(
  limit: number,
  options?: { excludeMlsIds?: readonly string[] },
): Promise<string[]> {
  const cap = Math.max(1, Math.min(Math.round(limit), 40))
  const exclude = [
    ...new Set(
      (options?.excludeMlsIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ]
  const rows = await query<{ mls_id: string }>(
    `SELECT l.mls_id
       FROM listings l
      WHERE COALESCE(l.photo_count, 0) > 0
        AND ${missingIndexedSlotsSql('l')}
        AND NOT (l.mls_id = ANY($4::text[]))
      ORDER BY CASE WHEN l.status_bucket = 'Active' THEN 0 ELSE 1 END,
               l.list_date DESC NULLS LAST,
               l.mls_id DESC
      LIMIT $3`,
    [LISTING_PHOTO_SLOT_CAP, HERO_SLOT_INDEX_MIN_BYTES, cap, exclude],
  )
  return rows.map((row) => row.mls_id).filter((id) => id.trim().length > 0)
}

/** True when every MLS slot (capped) is in the index — same bar as leftover count. */
export async function listingHasAllIndexedPhotoSlots(
  cacheId: string,
  photoCount: number,
): Promise<boolean> {
  const id = cacheId.trim()
  const expected = Math.min(Math.max(Math.round(photoCount) || 0, 0), LISTING_PHOTO_SLOT_CAP)
  if (!id || expected <= 0) return true
  const row = await queryOne<{ stored: number }>(
    `SELECT COUNT(*)::int AS stored
       FROM listing_photo_index
      WHERE cache_id = $1
        AND photo_index >= 0
        AND photo_index < $2
        AND byte_length >= $3`,
    [id, expected, HERO_SLOT_INDEX_MIN_BYTES],
  )
  return (row?.stored ?? 0) >= expected
}

/** Rows that count as real R2 photos — same byte floor as leftover coverage. */
export async function countIndexedListingPhotos(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM listing_photo_index
      WHERE byte_length >= $1`,
    [HERO_SLOT_INDEX_MIN_BYTES],
  )
  return row?.count ?? 0
}

export async function deleteListingPhotoIndexRows(cacheId: string): Promise<void> {
  const id = cacheId.trim()
  if (!id) return
  await query('DELETE FROM listing_photo_index WHERE cache_id = $1', [id])
}
