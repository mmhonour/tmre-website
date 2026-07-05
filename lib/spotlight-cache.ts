import 'server-only'

import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/listings-db'
import {
  fetchListingByMlsId,
  persistListingRecord,
  type ListingsSource,
} from '@/lib/listings-store'
import { fetchAllPhotoUrls, type Listing } from '@/lib/rets'
import { SPOTLIGHT_LISTING } from '@/lib/spotlight-listing'

export const SPOTLIGHT_CACHE_PREFIX = 'spotlight:v1'
export const SPOTLIGHT_LISTING_TTL_MS = 30 * 60 * 1000
export const SPOTLIGHT_PHOTOS_TTL_MS = 12 * 60 * 60 * 1000

export type SpotlightCachePayload = {
  listing: Listing | null
  photos?: string[]
  source: ListingsSource
  cachedAt: string
  photosCachedAt?: string
}

function spotlightCacheKey(mlsId: string): string {
  return `${SPOTLIGHT_CACHE_PREFIX}:${mlsId}`
}

function isFresh(iso: string | undefined, ttlMs: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < ttlMs
}

export function readSpotlightCache(mlsId: string): SpotlightCachePayload | null {
  const row = readStatsCacheRow(spotlightCacheKey(mlsId))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as SpotlightCachePayload
  } catch {
    return null
  }
}

export function writeSpotlightCache(
  mlsId: string,
  payload: SpotlightCachePayload,
): void {
  writeStatsCacheRow(spotlightCacheKey(mlsId), payload)
}

export async function resolveSpotlightListing(options: {
  includePhotos: boolean
  forceRefresh?: boolean
}): Promise<{
  listing: Listing | null
  photos: string[]
  source: ListingsSource
  cacheHit: boolean
}> {
  const mlsId = SPOTLIGHT_LISTING.mlsId?.trim()
  if (!mlsId) {
    return { listing: null, photos: [], source: 'db', cacheHit: false }
  }

  const cached = options.forceRefresh ? null : readSpotlightCache(mlsId)
  const listingFresh =
    cached?.listing != null &&
    isFresh(cached.cachedAt, SPOTLIGHT_LISTING_TTL_MS)
  const photosFresh =
    cached?.photos != null &&
    cached.photos.length > 0 &&
    isFresh(cached.photosCachedAt, SPOTLIGHT_PHOTOS_TTL_MS)

  if (listingFresh && cached) {
    if (!options.includePhotos || photosFresh) {
      return {
        listing: cached.listing,
        photos: options.includePhotos ? (cached.photos ?? []) : [],
        source: 'db',
        cacheHit: true,
      }
    }
  }

  let listing = listingFresh ? cached!.listing : null
  let source: ListingsSource = cached?.source ?? 'db'

  if (!listing) {
    const fetched = await fetchListingByMlsId(mlsId)
    listing = fetched.listing
    source = fetched.source
    if (listing) persistListingRecord(listing)
  }

  let photos = photosFresh ? (cached!.photos ?? []) : []
  let photosCachedAt = photosFresh ? cached!.photosCachedAt : undefined

  if (options.includePhotos && listing && !photosFresh) {
    photos = await fetchAllPhotoUrls(
      listing.listingKey || mlsId,
      mlsId,
      listing.photoCount,
    )
    photosCachedAt = new Date().toISOString()
  }

  writeSpotlightCache(mlsId, {
    listing,
    photos: photos.length > 0 ? photos : cached?.photos,
    source,
    cachedAt: listingFresh && cached ? cached.cachedAt : new Date().toISOString(),
    photosCachedAt: photosCachedAt ?? cached?.photosCachedAt,
  })

  return {
    listing,
    photos: options.includePhotos ? photos : [],
    source,
    cacheHit: false,
  }
}

export async function rebuildSpotlightCache(): Promise<boolean> {
  const mlsId = SPOTLIGHT_LISTING.mlsId?.trim()
  if (!mlsId) return false
  try {
    await resolveSpotlightListing({ includePhotos: true, forceRefresh: true })
    console.info('[spotlight-cache] rebuilt for', mlsId)
    return true
  } catch (err) {
    console.error('[spotlight-cache] rebuild failed', err)
    return false
  }
}
