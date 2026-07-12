import 'server-only'

import { refreshListingPropertyTax } from '@/lib/listing-property-tax'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import {
  fetchListingByMlsId,
  persistListingRecord,
  readListingFromDbByMlsId,
  type ListingsSource,
} from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import {
  getSpotlightListingConfig,
  type SpotlightListingConfig,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'
import { resolveSpotlightMlsId } from '@/lib/spotlight-mls-cache'

export { resolveSpotlightMlsId } from '@/lib/spotlight-mls-cache'

export const SPOTLIGHT_CACHE_PREFIX = 'spotlight:v2'
export const SPOTLIGHT_LISTING_TTL_MS = 30 * 60 * 1000
export const SPOTLIGHT_PHOTOS_TTL_MS = 12 * 60 * 60 * 1000

export type SpotlightCachePayload = {
  listing: Listing | null
  /** Local photo-proxy paths only (`/api/listings/.../photos/N`). */
  photos?: string[]
  source: ListingsSource
  cachedAt: string
  photosCachedAt?: string
}

function spotlightCacheKey(mlsId: string): string {
  return `${SPOTLIGHT_CACHE_PREFIX}:${mlsId}`
}

function withFreshTax(listing: Listing | null): Listing | null {
  return listing ? refreshListingPropertyTax(listing) : null
}

/** SQLite row first (property_tax columns), then spotlight cache, then RETS. */
async function loadSpotlightListingRecord(
  mlsId: string,
  cached: SpotlightCachePayload | null,
  listingFresh: boolean,
): Promise<{ listing: Listing | null; source: ListingsSource }> {
  const { listing: dbListing } = await readListingFromDbByMlsId(mlsId)
  if (dbListing) {
    return { listing: dbListing, source: 'db' }
  }
  if (listingFresh && cached?.listing) {
    return {
      listing: withFreshTax(cached.listing),
      source: cached.source ?? 'db',
    }
  }
  const fetched = await fetchListingByMlsId(mlsId)
  if (fetched.listing) persistListingRecord(fetched.listing)
  return { listing: withFreshTax(fetched.listing), source: fetched.source }
}

function isFresh(iso: string | undefined, ttlMs: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < ttlMs
}

/** Reject legacy CDN photo caches so we resync from SQLite proxy paths. */
function photosAreLocalProxy(photos: string[] | undefined): boolean {
  if (!photos || photos.length === 0) return false
  return photos.every((url) => url.startsWith('/api/listings/'))
}

export async function readSpotlightCache(
  mlsId: string,
): Promise<SpotlightCachePayload | null> {
  const row = await readStatsCacheRow(spotlightCacheKey(mlsId))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as SpotlightCachePayload
  } catch {
    return null
  }
}

export async function writeSpotlightCache(
  mlsId: string,
  payload: SpotlightCachePayload,
): Promise<void> {
  await writeStatsCacheRow(spotlightCacheKey(mlsId), payload)
}

export async function resolveSpotlightListing(options: {
  includePhotos: boolean
  forceRefresh?: boolean
  config?: SpotlightListingConfig
  propertyTab?: SpotlightPropertyTabId
}): Promise<{
  listing: Listing | null
  photos: string[]
  source: ListingsSource
  cacheHit: boolean
}> {
  const config =
    options.config ??
    getSpotlightListingConfig(options.propertyTab ?? 1)
  const mlsId = await resolveSpotlightMlsId(config)
  if (!mlsId) {
    return { listing: null, photos: [], source: 'db', cacheHit: false }
  }

  const cached = options.forceRefresh ? null : await readSpotlightCache(mlsId)
  const listingFresh =
    cached?.listing != null &&
    isFresh(cached.cachedAt, SPOTLIGHT_LISTING_TTL_MS)
  const photosFresh =
    photosAreLocalProxy(cached?.photos) &&
    isFresh(cached?.photosCachedAt, SPOTLIGHT_PHOTOS_TTL_MS)

  if (listingFresh && cached) {
    if (!options.includePhotos || photosFresh) {
      const { listing, source } = await loadSpotlightListingRecord(
        mlsId,
        cached,
        true,
      )
      return {
        listing,
        photos: options.includePhotos ? (cached.photos ?? []) : [],
        source,
        cacheHit: true,
      }
    }
  }

  const { listing, source } = await loadSpotlightListingRecord(
    mlsId,
    cached,
    listingFresh,
  )

  let photos = photosFresh ? (cached!.photos ?? []) : []
  let photosCachedAt = photosFresh ? cached!.photosCachedAt : undefined

  if (options.includePhotos && listing && !photosFresh) {
    const resolved = await resolveListingPhotoUrls(
      mlsId,
      listing.listingKey || mlsId,
      listing.photoCount,
    )
    photos = resolved.photos
    photosCachedAt = new Date().toISOString()
  }

  await writeSpotlightCache(mlsId, {
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

export async function rebuildSpotlightCache(
  propertyTab: SpotlightPropertyTabId = 1,
): Promise<boolean> {
  const config = getSpotlightListingConfig(propertyTab)
  const mlsId = await resolveSpotlightMlsId(config)
  if (!mlsId) return false
  try {
    await resolveSpotlightListing({
      includePhotos: true,
      forceRefresh: true,
      config,
      propertyTab,
    })
    console.info('[spotlight-cache] rebuilt for', mlsId)
    return true
  } catch (err) {
    console.error('[spotlight-cache] rebuild failed', err)
    return false
  }
}
