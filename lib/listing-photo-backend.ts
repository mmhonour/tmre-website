import 'server-only'

import {
  countFreshListingPhotosFromDb,
  deleteListingPhotoIndexRows,
  firstStoredListingPhotoIndexFromDb,
  listListingPhotoIndicesFromDb,
  listingPhotoStorageSpanFromDb,
  readListingPhotoIndexRow,
  upsertListingPhotoIndexRow,
} from '@/lib/db/listing-photo-index-repo'
import {
  countFreshListingPhotos as sqliteCountFresh,
  deleteListingPhotos as sqliteDelete,
  firstStoredListingPhotoIndex as sqliteFirstIndex,
  listStoredListingPhotoIndices as sqliteListIndices,
  listingPhotoStorageSpan as sqliteSpan,
  readListingPhotoBlob as sqliteReadBlob,
  upsertListingPhotoBlob as sqliteUpsertBlob,
} from '@/lib/listing-photos-db'
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
    return getR2ListingPhoto(cacheId, photoIndex)
  }
  const row = sqliteReadBlob(cacheId, photoIndex)
  if (!row) return null
  return { data: row.data, contentType: row.contentType, syncedAt: row.syncedAt }
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
  if (photoBackendUsesR2()) {
    await deleteR2ListingPhotos(cacheId)
    await deleteListingPhotoIndexRows(cacheId)
    return
  }
  sqliteDelete(cacheId)
}
