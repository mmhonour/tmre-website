import 'server-only'

import {
  persistComparableEdgesForListing,
  readCachedComparables,
} from '@/lib/listing-comparables-cache'
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

export type WarmListingTabsResult = {
  found: boolean
  comparables: boolean
  ifEstimate: boolean
  uag: boolean
  photos: boolean
}

/**
 * Warm every listing-detail tab's server data for one MLS id so the
 * Comparables, Comparable Rentals, and If tabs serve straight from the Postgres
 * cache and hero/deck photos are already in the photo store. People bounce
 * between these tabs, so we compute-and-persist everything once up front instead
 * of recomputing per tab visit. Each piece is best-effort and independent.
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
  return result
}
