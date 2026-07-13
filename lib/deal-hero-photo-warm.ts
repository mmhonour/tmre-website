import 'server-only'

import {
  dealListingPhotoUrl,
  type DealPickPayload,
} from '@/lib/deal-pick'
import {
  firstStoredListingPhotoIndexAsync,
  readListingPhotoMeta,
} from '@/lib/listing-photo-backend'
import { listingPhotoProxyUrl } from '@/lib/listing-url'
import {
  listingPhotoCacheId,
  resolveListingPhotoBuffer,
} from '@/lib/listing-photo-store'

/** Warm hero + thumbnail-deck photos for a deal listing before serving to the client. */
export async function warmDealListingPhotos(
  payload: DealPickPayload,
  maxPhotoIndex = 5,
): Promise<string | null> {
  const listing = payload.listing
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = listing.photoCount ?? 0
  if (!cacheId || photoCount <= 0) return payload.photoUrl ?? dealListingPhotoUrl(listing)

  const listingKey = listing.listingKey?.trim() || listing.mlsId
  const lastIndex = Math.min(Math.max(photoCount - 1, 0), maxPhotoIndex)

  try {
    await Promise.all(
      Array.from({ length: lastIndex + 1 }, (_, photoIndex) =>
        resolveListingPhotoBuffer({
          mlsId: cacheId,
          listingKey,
          photoIndex,
          photoCountHint: photoCount,
        }).catch(() => null),
      ),
    )
  } catch (err) {
    console.warn(
      '[deal-hero-photo-warm] photo warm failed',
      err instanceof Error ? err.message : err,
    )
  }

  // After warming, point the hero at the first index that actually stored a
  // photo so a leading empty RETS slot doesn't 404 the homepage centerpiece.
  // Best-effort only — a photo-index lookup failure must never break the deal.
  try {
    const heroIndex = await firstStoredListingPhotoIndexAsync(cacheId)
    if (heroIndex != null && heroIndex > 0) {
      return listingPhotoProxyUrl(cacheId, heroIndex)
    }
  } catch (err) {
    console.warn(
      '[deal-hero-photo-warm] hero index lookup failed',
      err instanceof Error ? err.message : err,
    )
  }

  return payload.photoUrl ?? dealListingPhotoUrl(listing)
}

export async function ensureDealPickPhotos(
  payload: DealPickPayload,
): Promise<DealPickPayload> {
  const photoUrl = await warmDealListingPhotos(payload)
  return photoUrl ? { ...payload, photoUrl } : payload
}

/** True when hero + thumbnail-deck indices are already cached. */
export async function dealPickPhotosReady(
  payload: DealPickPayload,
  maxPhotoIndex = 5,
): Promise<boolean> {
  const listing = payload.listing
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = listing.photoCount ?? 0
  if (!cacheId || photoCount <= 0) return true

  const lastIndex = Math.min(Math.max(photoCount - 1, 0), maxPhotoIndex)
  const metas = await Promise.all(
    Array.from({ length: lastIndex + 1 }, (_, photoIndex) =>
      readListingPhotoMeta(cacheId, photoIndex),
    ),
  )
  return metas.every((meta) => meta != null && meta.byteLength >= 100)
}
