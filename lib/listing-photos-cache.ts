import 'server-only'

import {
  countFreshListingPhotos,
  countListingPhotos,
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

/** Listing photo manifest — local proxy URLs; count discovery hits RETS only when unknown. */
export async function resolveListingPhotoUrls(
  mlsId: string,
  listingKey: string,
  photoCountHint?: number | null,
  options: { forceRefresh?: boolean } = {},
): Promise<{ photos: string[]; cacheHit: boolean }> {
  const id = mlsId.trim()
  if (!id) return { photos: [], cacheHit: false }

  const storedSpan = listingPhotoStorageSpan(id)
  let count = photoCountHint ?? 0
  if (count <= 0 && storedSpan > 0) count = storedSpan

  if (count <= 0 || options.forceRefresh) {
    const discovered = await discoverListingPhotoCount(
      listingKey || id,
      id,
      photoCountHint,
    )
    if (discovered > 0) count = discovered
  }

  if (count <= 0) return { photos: [], cacheHit: false }

  const freshRows = countFreshListingPhotos(
    id,
    count,
    listingPhotoSyncedAfter(LISTING_PHOTO_TTL_MS),
  )

  return {
    photos: buildListingPhotoProxyUrls(id, count),
    cacheHit: freshRows >= count,
  }
}
