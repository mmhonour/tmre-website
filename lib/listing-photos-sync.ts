import 'server-only'

import { listingRowId } from '@/lib/db/listings-repo'
import { readListingPhotoMeta } from '@/lib/listing-photo-backend'
import {
  cacheSatisfiesQuality,
  fullCacheOutrankedByMid,
  listingPhotoCardCacheId,
} from '@/lib/listing-photo-quality'
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
/** Same window as opening the listing showcase (`warmListingPhotos` hero deck). */
const SHOWCASE_HERO_MAX_INDEX = 5

export type ListingPhotoBackfillMode = 'hero' | 'all'

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
      quality: 'full',
    })
    if (hit && !hit.cacheHit) stored += 1
    if (index + 1 < photoCount) await sleep(PHOTO_FETCH_DELAY_MS)
  }

  return stored
}

/**
 * First six full-size MediaURL photos — the same fetch a showcase hero does
 * on first paint (size=full), so a new incremental listing is not a 404.
 */
export async function warmListingShowcasePhotos(
  listing: Listing,
): Promise<number> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), 60)
  if (!cacheId || photoCount <= 0) return 0

  const listingKey = listing.listingKey?.trim() || listing.mlsId.trim()
  const lastIndex = Math.min(Math.max(photoCount - 1, 0), SHOWCASE_HERO_MAX_INDEX)
  let stored = 0

  for (let photoIndex = 0; photoIndex <= lastIndex; photoIndex++) {
    const already = await readListingPhotoMeta(cacheId, photoIndex)
    if (already && already.byteLength >= 100) {
      const mid = await readListingPhotoMeta(
        listingPhotoCardCacheId(cacheId),
        photoIndex,
      )
      if (!fullCacheOutrankedByMid(already.byteLength, mid?.byteLength)) {
        continue
      }
    }
    const hit = await resolveListingPhotoBuffer({
      mlsId: cacheId,
      listingKey,
      photoIndex,
      photoCountHint: photoCount,
      quality: 'full',
    })
    if (hit && !hit.cacheHit) stored += 1
    if (photoIndex < lastIndex) await sleep(PHOTO_FETCH_DELAY_MS)
  }

  return stored
}

/**
 * True when the first six full-size shots are missing, stale, or only a
 * mid/card JPEG — the usual "listing is in Postgres, showcase still 404s" gap.
 */
export async function listingShowcasePhotosIncomplete(
  listing: Listing,
): Promise<boolean> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), 60)
  if (!cacheId || photoCount <= 0) return false

  const ttlMs = await getListingPhotoTtlMsFresh()
  const lastIndex = Math.min(photoCount - 1, SHOWCASE_HERO_MAX_INDEX)
  for (let photoIndex = 0; photoIndex <= lastIndex; photoIndex++) {
    const meta = await readListingPhotoMeta(cacheId, photoIndex)
    if (!meta) return true
    if (!isListingPhotoFresh(meta.syncedAt, ttlMs)) return true
    if (!cacheSatisfiesQuality(meta.byteLength, 'full')) return true
    const mid = await readListingPhotoMeta(
      listingPhotoCardCacheId(cacheId),
      photoIndex,
    )
    if (fullCacheOutrankedByMid(meta.byteLength, mid?.byteLength)) return true
  }
  return false
}

export async function listingNeedsPhotoBackfill(
  listing: Listing,
  mode: ListingPhotoBackfillMode,
): Promise<boolean> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = listing.photoCount ?? 0
  if (!cacheId || photoCount <= 0) return false
  if (mode === 'hero') return listingShowcasePhotosIncomplete(listing)
  return listingPhotosNeedRefresh(cacheId, photoCount)
}

export async function listPhotoBackfillCandidates(
  listings: Listing[],
  mode: ListingPhotoBackfillMode,
): Promise<Listing[]> {
  const flags = await Promise.all(
    listings.map(async (listing) =>
      (await listingNeedsPhotoBackfill(listing, mode)) ? listing : null,
    ),
  )
  return flags.filter((listing): listing is Listing => listing != null)
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

export type ListingPhotoBackfillResult = {
  scanned: number
  needed: number
  listings: number
  photos: number
  /** Listings that still need bytes. Dry-run uses this for the sample log. */
  candidates: Listing[]
}

/**
 * Pull photos that Postgres already knows about but R2/index does not.
 * `hero` = first six at size=full (showcase). `all` = every slot, also MediaURL full.
 */
export async function backfillListingPhotos(
  listings: Listing[],
  options: {
    mode?: ListingPhotoBackfillMode
    concurrency?: number
    progressLabel?: string
    dryRun?: boolean
  } = {},
): Promise<ListingPhotoBackfillResult> {
  const mode = options.mode ?? 'hero'
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const candidates = await listPhotoBackfillCandidates(listings, mode)
  const scanned = listings.length
  const needed = candidates.length

  if (options.dryRun || candidates.length === 0) {
    return { scanned, needed, listings: 0, photos: 0, candidates }
  }

  const label = options.progressLabel
  const total = candidates.length
  let index = 0
  let listingsDone = 0
  let photosStored = 0

  async function worker(): Promise<void> {
    while (index < candidates.length) {
      const current = candidates[index]!
      index += 1
      const position = index
      try {
        const stored =
          mode === 'hero'
            ? await warmListingShowcasePhotos(current)
            : await syncOneListingPhotos(current)
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
  return {
    scanned,
    needed,
    listings: listingsDone,
    photos: photosStored,
    candidates,
  }
}
