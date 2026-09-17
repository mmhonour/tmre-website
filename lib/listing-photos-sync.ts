import 'server-only'

import { listListingPhotoIndicesForCacheIds } from '@/lib/db/listing-photo-index-repo'
import { listingRowId } from '@/lib/db/listings-repo'
import { LISTING_PHOTO_SLOT_CAP } from '@/lib/hero-photo-inventory-backfill-shared'
import {
  ensureListingPhotoIndexFromR2,
  photoBackendUsesR2,
  readListingPhotoMeta,
} from '@/lib/listing-photo-backend'
import { listingPhotosHaveRequiredSlots } from '@/lib/listing-photo-coverage'
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
/**
 * Hero/SQLite fallback only. `--all` on R2 loads the index in 400-id SQL
 * chunks. Per-listing Promise.all over Closed inventory queues thousands of
 * waiters on PG_POOL_MAX (default 5) and the pooler times out
 * (`timeout exceeded when trying to connect`) before any photo is fetched.
 */
const GAP_SCAN_CONCURRENCY = 2

export type ListingPhotoBackfillMode = 'hero' | 'all'

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const cap = Math.max(1, Math.min(concurrency, items.length))
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: cap }, () => worker()))
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function syncOneListingPhotos(listing: Listing): Promise<number> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), LISTING_PHOTO_SLOT_CAP)
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

export type WarmListingPhotosResult = {
  stored: number
  timedOut: boolean
}

async function warmListingPhotoSlots(
  listing: Listing,
  lastIndex: number,
  opts?: { untilMs?: number },
): Promise<WarmListingPhotosResult> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), LISTING_PHOTO_SLOT_CAP)
  if (!cacheId || photoCount <= 0) return { stored: 0, timedOut: false }

  const listingKey = listing.listingKey?.trim() || listing.mlsId.trim()
  const end = Math.min(Math.max(photoCount - 1, 0), Math.max(lastIndex, 0))
  let stored = 0

  for (let photoIndex = 0; photoIndex <= end; photoIndex++) {
    if (opts?.untilMs != null && Date.now() >= opts.untilMs) {
      return { stored, timedOut: true }
    }
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
    if (await ensureListingPhotoIndexFromR2(cacheId, photoIndex)) {
      stored += 1
      continue
    }
    const hit = await resolveListingPhotoBuffer({
      mlsId: cacheId,
      listingKey,
      photoIndex,
      photoCountHint: photoCount,
      quality: 'full',
    })
    if (hit && !hit.cacheHit) {
      const meta = await readListingPhotoMeta(cacheId, photoIndex)
      if (meta && meta.byteLength >= 100) stored += 1
    } else if (await ensureListingPhotoIndexFromR2(cacheId, photoIndex)) {
      stored += 1
    }
    if (photoIndex < end) await sleep(PHOTO_FETCH_DELAY_MS)
  }

  return { stored, timedOut: false }
}

/**
 * First six full-size MediaURL photos — the same fetch a showcase hero does
 * on first paint (size=full), so a new incremental listing is not a 404.
 */
export async function warmListingShowcasePhotos(
  listing: Listing,
  opts?: { maxIndex?: number },
): Promise<number> {
  const indexCap = Math.min(
    Math.max(opts?.maxIndex ?? SHOWCASE_HERO_MAX_INDEX, 0),
    SHOWCASE_HERO_MAX_INDEX,
  )
  const result = await warmListingPhotoSlots(listing, indexCap)
  return result.stored
}

/**
 * Every remaining R2/index slot for this listing (Active or not), up to
 * LISTING_PHOTO_SLOT_CAP. Stops at `untilMs` so a 40-photo Closed row cannot
 * overrun the Railway burst; already-stored slots are skipped next hop.
 */
export async function warmListingInventoryPhotos(
  listing: Listing,
  opts?: { untilMs?: number },
): Promise<WarmListingPhotosResult> {
  return warmListingPhotoSlots(listing, LISTING_PHOTO_SLOT_CAP - 1, opts)
}

/**
 * True when the first six full-size shots are missing, stale, or only a
 * mid/card JPEG — the usual "listing is in Postgres, showcase still 404s" gap.
 */
export async function listingShowcasePhotosIncomplete(
  listing: Listing,
): Promise<boolean> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = Math.min(Math.max(listing.photoCount ?? 0, 0), LISTING_PHOTO_SLOT_CAP)
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

function listingPhotoCountForBackfill(listing: Listing): number {
  return Math.min(Math.max(listing.photoCount ?? 0, 0), LISTING_PHOTO_SLOT_CAP)
}

export async function listingNeedsPhotoBackfill(
  listing: Listing,
  mode: ListingPhotoBackfillMode,
): Promise<boolean> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = listingPhotoCountForBackfill(listing)
  if (!cacheId || photoCount <= 0) return false
  if (mode === 'hero') return listingShowcasePhotosIncomplete(listing)
  return listingPhotosNeedRefresh(cacheId, photoCount)
}

/**
 * `--all` catch-up: one SQL chunk instead of three queries per Closed row.
 * Skips TTL so a 30-minute default on a cold CLI does not re-queue every
 * complete gallery; pull still skips fresh slots via isListingPhotoFresh.
 */
async function listAllModeCandidatesFromIndex(
  listings: Listing[],
  options?: { progressLabel?: string },
): Promise<Listing[]> {
  const items = listings
    .map((listing) => ({
      listing,
      cacheId: listingPhotoCacheId(listing),
      expected: listingPhotoCountForBackfill(listing),
    }))
    .filter((item) => item.cacheId && item.expected > 0)
  const ids = [...new Set(items.map((item) => item.cacheId))]
  const label = options?.progressLabel
  const coverage = await listListingPhotoIndicesForCacheIds(ids, {
    onChunk:
      label && ids.length >= 200
        ? (done, total) => {
            console.info(
              `[listing-photos-sync] ${label} · scanning gaps ${done}/${total} (index chunks)`,
            )
          }
        : undefined,
  })
  return items
    .filter(({ cacheId, expected }) => {
      const indices = coverage.get(cacheId) ?? []
      return !listingPhotosHaveRequiredSlots(indices, expected)
    })
    .map((item) => item.listing)
}

export async function listPhotoBackfillCandidates(
  listings: Listing[],
  mode: ListingPhotoBackfillMode,
  options?: { progressLabel?: string },
): Promise<Listing[]> {
  if (mode === 'all' && photoBackendUsesR2()) {
    return listAllModeCandidatesFromIndex(listings, options)
  }
  const total = listings.length
  const label = options?.progressLabel
  const flags = await mapWithConcurrency(
    listings,
    GAP_SCAN_CONCURRENCY,
    async (listing, index) => {
      if (label && total >= 200 && (index + 1) % 250 === 0) {
        console.info(
          `[listing-photos-sync] ${label} · scanning gaps ${index + 1}/${total}`,
        )
      }
      return (await listingNeedsPhotoBackfill(listing, mode)) ? listing : null
    },
  )
  if (label && total >= 200) {
    console.info(`[listing-photos-sync] ${label} · scanning gaps ${total}/${total}`)
  }
  return flags.filter((listing): listing is Listing => listing != null)
}

/** Warm photo blobs for active inventory after a town sync. */
export async function syncListingPhotosForListings(
  listings: Listing[],
  options: { concurrency?: number; progressLabel?: string } = {},
): Promise<{ listings: number; photos: number }> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const refreshFlags = await mapWithConcurrency(
    listings,
    GAP_SCAN_CONCURRENCY,
    async (l) => {
      const id = listingPhotoCacheId(l)
      const count = l.photoCount ?? 0
      const needs =
        Boolean(id) && count > 0 && (await listingPhotosNeedRefresh(id, count))
      return needs ? l : null
    },
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
    /** Caller already ran listPhotoBackfillCandidates — do not scan again. */
    alreadyCandidates?: boolean
  } = {},
): Promise<ListingPhotoBackfillResult> {
  const mode = options.mode ?? 'hero'
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const candidates = options.alreadyCandidates
    ? listings
    : await listPhotoBackfillCandidates(listings, mode, {
        progressLabel: options.progressLabel,
      })
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
