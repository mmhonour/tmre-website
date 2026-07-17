import 'server-only'

import {
  persistComparableEdgesForListing,
  readCachedComparables,
} from '@/lib/listing-comparables-cache'
import type { ComparableListing } from '@/lib/listing-comparables-shared'
import { resolveListingIfPayload } from '@/lib/listing-if-compute'
import { resolveUagForSubject } from '@/lib/listing-uag-resolve'
import {
  listingPhotoCacheId,
  resolveListingPhotoBuffer,
} from '@/lib/listing-photo-store'
import {
  persistListingByMlsId,
  readListingFromDbByMlsId,
} from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'

/** Hero + thumbnail-deck photo indices to pre-load into the photo store. */
const HERO_DECK_MAX_INDEX = 5

/** Cap associated (comps / UAG) thumb warms per subject visit. */
const ASSOCIATED_THUMB_CAP = 24
const ASSOCIATED_THUMB_CONCURRENCY = 3

/** Compute + persist sale + rental comps only when the cache is cold/stale. */
async function warmComparables(subject: Listing): Promise<void> {
  const [sale, rental] = await Promise.all([
    readCachedComparables(subject, 'sale'),
    readCachedComparables(subject, 'rental'),
  ])
  if (sale && rental) return
  await persistComparableEdgesForListing(subject)
}

async function warmListingPhotos(listing: Listing): Promise<void> {
  const cacheId = listingPhotoCacheId(listing)
  const photoCount = listing.photoCount ?? 0
  if (!cacheId || photoCount <= 0) return
  const listingKey = listing.listingKey?.trim() || listing.mlsId
  const lastIndex = Math.min(Math.max(photoCount - 1, 0), HERO_DECK_MAX_INDEX)
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
}

/**
 * Pull index-0 thumbs for Sales / Rentals / UAG rows into the same R2 (or
 * SQLite) photo store the subject uses, so associated rows paint from CDN/cache
 * instead of cold RETS on every visit.
 */
async function warmAssociatedThumbPhotos(
  comps: ComparableListing[],
): Promise<number> {
  const seen = new Set<string>()
  const targets: {
    cacheId: string
    listingKey: string
    photoCount: number | null
  }[] = []

  for (const comp of comps) {
    const listingKey = comp.listingKey?.trim() || ''
    const mlsId = comp.mlsId?.trim() || ''
    const cacheId = listingKey || mlsId
    if (!cacheId || seen.has(cacheId)) continue
    // Explicit zero means RETS reported no photos — skip.
    if (comp.photoCount === 0) continue
    seen.add(cacheId)
    targets.push({
      cacheId,
      listingKey: listingKey || mlsId,
      photoCount: comp.photoCount,
    })
    if (targets.length >= ASSOCIATED_THUMB_CAP) break
  }

  if (targets.length === 0) return 0

  let stored = 0
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const current = targets[cursor]!
      cursor += 1
      try {
        const hit = await resolveListingPhotoBuffer({
          mlsId: current.cacheId,
          listingKey: current.listingKey,
          photoIndex: 0,
          photoCountHint: current.photoCount,
        })
        if (hit) stored += 1
      } catch {
        // Best-effort — a single miss must not fail the warm.
      }
    }
  }

  await Promise.all(
    Array.from({ length: ASSOCIATED_THUMB_CONCURRENCY }, () => worker()),
  )
  return stored
}

async function collectAssociatedComps(
  subject: Listing,
  uag:
    | Awaited<ReturnType<typeof resolveUagForSubject>>
    | null
    | undefined,
): Promise<ComparableListing[]> {
  const [sale, rental] = await Promise.all([
    readCachedComparables(subject, 'sale'),
    readCachedComparables(subject, 'rental'),
  ])
  return [
    ...(sale?.sold ?? []),
    ...(sale?.active ?? []),
    ...(rental?.sold ?? []),
    ...(rental?.active ?? []),
    ...(uag?.sale ?? []),
    ...(uag?.rental ?? []),
  ]
}

export type WarmListingTabsResult = {
  found: boolean
  comparables: boolean
  ifEstimate: boolean
  uag: boolean
  photos: boolean
  associatedPhotos: number
}

/**
 * Warm every listing-detail tab's server data for one MLS id so the
 * Comparables, Comparable Rentals, and If tabs serve straight from the Postgres
 * cache and hero/deck photos are already in the photo store. Also preloads
 * index-0 thumbs for associated Sales / Rentals / UAG rows into the same photo
 * CDN path. Each piece is best-effort and independent.
 */
export async function warmListingTabData(
  mlsId: string,
): Promise<WarmListingTabsResult> {
  const result: WarmListingTabsResult = {
    found: false,
    comparables: false,
    ifEstimate: false,
    uag: false,
    photos: false,
    associatedPhotos: 0,
  }

  const id = mlsId?.trim()
  if (!id) return result

  let listing = (await readListingFromDbByMlsId(id)).listing
  if (!listing) {
    // Not cached yet — pull from RETS into Postgres, then re-read.
    await persistListingByMlsId(id).catch(() => undefined)
    listing = (await readListingFromDbByMlsId(id)).listing
  }
  if (!listing) return result
  result.found = true

  const subject = listing
  const [comps, ifEstimate, uag, photos] = await Promise.allSettled([
    // Sale + rental comparables → listing_relations (skips if already cached)
    warmComparables(subject),
    // If value estimate (+ range blurb) → listing_if_estimates (cache-first)
    resolveListingIfPayload(subject),
    // Under-agreement comps → stats_cache (on-demand RETS, TTL cache-first)
    resolveUagForSubject(subject),
    // Hero + deck photos → photo store (cache-first)
    warmListingPhotos(subject),
  ])

  result.comparables = comps.status === 'fulfilled'
  result.ifEstimate = ifEstimate.status === 'fulfilled'
  result.uag = uag.status === 'fulfilled'
  result.photos = photos.status === 'fulfilled'

  const uagPayload = uag.status === 'fulfilled' ? uag.value : null
  try {
    const associated = await collectAssociatedComps(subject, uagPayload)
    result.associatedPhotos = await warmAssociatedThumbPhotos(associated)
  } catch {
    result.associatedPhotos = 0
  }

  return result
}
