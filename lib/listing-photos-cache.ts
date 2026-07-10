import 'server-only'

import {
  countFreshListingPhotos,
  listStoredListingPhotoIndices,
  listingPhotoStorageSpan,
} from '@/lib/listings-db'
import {
  LISTING_PHOTO_TTL_MS,
  listingPhotoSyncedAfter,
} from '@/lib/listing-photo-ttl'
import { discoverListingPhotoCount } from '@/lib/rets'

/** Local proxy paths — bytes always served from SQLite via the photo API. */
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

/** Listing photo manifest — local proxy URLs; empty/missing RETS slots are omitted. */
export async function resolveListingPhotoUrls(
  mlsId: string,
  listingKey: string,
  photoCountHint?: number | null,
  options: { forceRefresh?: boolean; sqliteOnly?: boolean } = {},
): Promise<{ photos: string[]; cacheHit: boolean }> {
  const id = mlsId.trim()
  if (!id) return { photos: [], cacheHit: false }

  const storedIndices = listStoredListingPhotoIndices(id)
  // After RETS/media sync, only expose photos that actually landed in SQLite.
  if (storedIndices.length > 0 && !options.forceRefresh) {
    const span = listingPhotoStorageSpan(id)
    const freshRows = countFreshListingPhotos(
      id,
      Math.max(span, storedIndices.length),
      listingPhotoSyncedAfter(LISTING_PHOTO_TTL_MS),
    )
    return {
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

  if (options.sqliteOnly) {
    return { photos: [], cacheHit: false }
  }

  // Cold path before any blobs exist — still return dense placeholders so the
  // photo API can fetch on demand; empty downloads simply 404 and stay out of
  // later manifests once stored indices populate.
  return {
    photos: buildListingPhotoProxyUrls(id, count),
    cacheHit: false,
  }
}
