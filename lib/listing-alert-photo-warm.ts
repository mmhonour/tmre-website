import 'server-only'

import { readListingPhotoMeta } from '@/lib/listing-photo-backend'
import { listingPhotoCacheId } from '@/lib/listing-photo-store'
import { warmListingShowcasePhotos } from '@/lib/listing-photos-sync'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import {
  takeAlertLeadPhotoMlsIds,
} from '@/lib/listing-alert-photo-warm-shared'

export {
  ALERT_LEAD_PHOTO_WARM_CAP,
  takeAlertLeadPhotoMlsIds,
} from '@/lib/listing-alert-photo-warm-shared'

export type AlertLeadPhotoWarmResult = {
  attempted: number
  stored: number
  skipped: number
}

/**
 * Prompt R2 for photo 0 of listings Incremental / OH just wrote, then the
 * caller marks alerts dirty. Showcase six stay on Lane 3.
 */
export async function warmAlertLeadPhotos(
  mlsIds: readonly string[],
): Promise<AlertLeadPhotoWarmResult> {
  const ids = takeAlertLeadPhotoMlsIds(mlsIds)
  let stored = 0
  let skipped = 0
  for (const mlsId of ids) {
    try {
      const { listing } = await readListingFromDbByMlsId(mlsId)
      if (!listing) continue
      const cacheId = listingPhotoCacheId(listing)
      if (!cacheId) continue
      const already = await readListingPhotoMeta(cacheId, 0)
      if (already && already.byteLength >= 100) {
        skipped += 1
        continue
      }
      const wrote = await warmListingShowcasePhotos(listing, { maxIndex: 0 })
      if (wrote > 0) stored += 1
    } catch (err) {
      console.warn(
        `[alert-lead-photo] ${mlsId} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { attempted: ids.length, stored, skipped }
}
