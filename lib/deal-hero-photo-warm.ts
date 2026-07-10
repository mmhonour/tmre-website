import 'server-only'

import {
  dealListingPhotoUrl,
  type DealPickPayload,
} from '@/lib/deal-pick'
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

  return payload.photoUrl ?? dealListingPhotoUrl(listing)
}

export async function ensureDealPickPhotos(
  payload: DealPickPayload,
): Promise<DealPickPayload> {
  const photoUrl = await warmDealListingPhotos(payload)
  return photoUrl ? { ...payload, photoUrl } : payload
}
