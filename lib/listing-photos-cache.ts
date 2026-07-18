import 'server-only'

import {
  countFreshListingPhotosAsync,
  listStoredListingPhotoIndicesAsync,
  listingPhotoStorageSpanAsync,
} from '@/lib/listing-photo-backend'
import {
  LISTING_PHOTO_TTL_MS,
  listingPhotoSyncedAfter,
} from '@/lib/listing-photo-ttl'
import { discoverListingPhotoCount } from '@/lib/rets'

/** Local proxy paths — bytes always served from the photo store via the photo API. */
export function buildListingPhotoProxyUrls(mlsId: string, count: number): string[] {
  const id = mlsId.trim()
  if (!id || count <= 0) return []
  const capped = Math.min(count, 250)
  return Array.from(
    { length: capped },
    (_, i) => `/api/listings/${encodeURIComponent(id)}/photos/${i}`,
  )
}

/** Proxy URLs for the photo indices that actually downloaded (skips empty RETS slots). */
export function buildListingPhotoProxyUrlsForIndices(
  mlsId: string,
  indices: readonly number[],
): string[] {
  const id = mlsId.trim()
  if (!id || indices.length === 0) return []
  return indices
    .filter((index) => Number.isFinite(index) && index >= 0)
    .slice(0, 250)
    .map((index) => `/api/listings/${encodeURIComponent(id)}/photos/${index}`)
}

/**
 * Listing photo manifest — local proxy URLs.
 *
 * Lookup uses the sync cache id (`listingKey || mlsId`) first, then falls back
 * to the request mlsId for legacy rows. When nothing is stored yet but MLS
 * reports `photoCount > 0`, we still return dense placeholder proxy URLs so the
 * Photos UI can load on demand via `?fetch=1` (ListingThumbImage). `sqliteOnly`
 * only skips RETS *discovery* when the count hint is missing — it must not hide
 * known photos.
 */
export async function resolveListingPhotoUrls(
  mlsId: string,
  listingKey: string,
  photoCountHint?: number | null,
  options: { forceRefresh?: boolean; sqliteOnly?: boolean } = {},
): Promise<{ photos: string[]; cacheHit: boolean }> {
  const id = mlsId.trim()
  if (!id) return { photos: [], cacheHit: false }

  const cacheId = listingKey?.trim() || id
  let indexLookupId = cacheId
  let storedIndices = await listStoredListingPhotoIndicesAsync(cacheId)
  if (storedIndices.length === 0 && cacheId !== id) {
    storedIndices = await listStoredListingPhotoIndicesAsync(id)
    if (storedIndices.length > 0) indexLookupId = id
  }

  // After RETS/media sync, only expose photos that actually landed in the store.
  if (storedIndices.length > 0 && !options.forceRefresh) {
    const span = await listingPhotoStorageSpanAsync(indexLookupId)
    const freshRows = await countFreshListingPhotosAsync(
      indexLookupId,
      Math.max(span, storedIndices.length),
      listingPhotoSyncedAfter(LISTING_PHOTO_TTL_MS),
    )
    return {
      // Client URLs keep the request mlsId; the photo proxy remaps to cache id.
      photos: buildListingPhotoProxyUrlsForIndices(id, storedIndices),
      cacheHit: freshRows >= storedIndices.length,
    }
  }

  let count = photoCountHint ?? 0
  if (count <= 0 && storedIndices.length > 0) count = storedIndices.length

  if (count <= 0 || options.forceRefresh) {
    if (options.sqliteOnly) {
      return { photos: [], cacheHit: false }
    }
    const discovered = await discoverListingPhotoCount(
      listingKey || id,
      id,
      photoCountHint,
    )
    if (discovered > 0) count = discovered
  }

  if (count <= 0) return { photos: [], cacheHit: false }

  // Cold path — dense placeholders so the photo API can fetch on demand.
  return {
    photos: buildListingPhotoProxyUrls(id, count),
    cacheHit: false,
  }
}
