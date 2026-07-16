import 'server-only'

import { listingRowId } from '@/lib/db/listings-repo'
import { readListingPhotoMeta } from '@/lib/listing-photo-backend'
import { getListingPhotoTtlMsFresh } from '@/lib/listing-photo-ttl-config'
import {
  isListingPhotoFresh,
  listingPhotoCacheId,
  listingPhotosNeedRefresh,
  resolveListingPhotoBuffer,
} from '@/lib/listing-photo-store'
import type { Listing } from '@/lib/rets'

const DEFAULT_CONCURRENCY = 2
const PHOTO_FETCH_DELAY_MS = 40

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function syncOneListingPhotos(listing: Listing): Promise<number> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), 60)
  if (!cacheId || photoCount <= 0) return 0

  if (!(await listingPhotosNeedRefresh(cacheId, photoCount))) return 0

  const listingKey = listing.listingKey?.trim() || listing.mlsId.trim()
  let stored = 0

  const ttlMs = await getListingPhotoTtlMsFresh()
  for (let index = 0; index < photoCount; index++) {
    const existing = await readListingPhotoMeta(cacheId, index)
    if (existing && isListingPhotoFresh(existing.syncedAt, ttlMs)) continue

    const hit = await resolveListingPhotoBuffer({
      mlsId: cacheId,
      listingKey,
      photoIndex: index,
      photoCountHint: photoCount,
    })
    if (hit && !hit.cacheHit) stored += 1
    if (index + 1 < photoCount) await sleep(PHOTO_FETCH_DELAY_MS)
  }

  return stored
}

/** Warm photo blobs for active inventory after a town sync. */
export async function syncListingPhotosForListings(
  listings: Listing[],
  options: { concurrency?: number; progressLabel?: string } = {},
): Promise<{ listings: number; photos: number }> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const refreshFlags = await Promise.all(
    listings.map(async (l) => {
      const id = listingPhotoCacheId(l)
      const count = l.photoCount ?? 0
      const needs =
        Boolean(id) && count > 0 && (await listingPhotosNeedRefresh(id, count))
      return needs ? l : null
    }),
  )
  const candidates = refreshFlags.filter((l): l is Listing => l != null)

  if (candidates.length === 0) return { listings: 0, photos: 0 }

  const total = candidates.length
  const label = options.progressLabel
  let index = 0
  let listingsDone = 0
  let photosStored = 0

  async function worker(): Promise<void> {
    while (index < candidates.length) {
      const current = candidates[index]!
      index += 1
      const position = index
      try {
        const stored = await syncOneListingPhotos(current)
        photosStored += stored
        listingsDone += 1
        if (label) {
          const addr = current.address?.street?.trim() || listingRowId(current)
          console.info(
            `[listing-photos-sync] ${label} ${position}/${total} · ${addr} — ` +
              `${stored} new (${photosStored} total this town)`,
          )
        }
      } catch (err) {
        console.warn(
          `[listing-photos-sync] ${listingRowId(current)} failed`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return { listings: listingsDone, photos: photosStored }
}
