import 'server-only'

import { refreshListingPropertyTax } from '@/lib/listing-property-tax'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import {
  persistListingRecord,
  readListingFromDbByMlsId,
  type ListingsSource,
} from '@/lib/listings-store'
import { getListingByMlsId, type Listing } from '@/lib/rets'
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

/**
 * Spotlight must reflect the live MLS row. When the stats_cache TTL has expired
 * (or the DB row looks Closed/Expired), pull RETS first and persist. Fresh cache
 * hits stay on Postgres so we do not RETS-hammer every page view.
 */
async function loadSpotlightListingRecord(
  mlsId: string,
  cached: SpotlightCachePayload | null,
  listingFresh: boolean,
): Promise<{ listing: Listing | null; source: ListingsSource }> {
  const { listing: dbListing } = await readListingFromDbByMlsId(mlsId)

  if (listingFresh && cached?.listing) {
    return {
      listing: withFreshTax(cached.listing),
      source: cached.source ?? 'db',
    }
  }

  const dbStatus = (dbListing?.status || '').toLowerCase()
  const dbLooksInactive =
    !dbListing ||
    dbStatus.includes('closed') ||
    dbStatus.includes('expired') ||
    dbStatus.includes('withdrawn')

  // Cache miss / TTL expired, or DB stuck on a prior Closed row for this MLS id.
  if (!listingFresh || dbLooksInactive) {
    try {
      const live = await getListingByMlsId(mlsId)
      if (live) {
        void persistListingRecord(live).catch((err) => {
          console.warn('[spotlight-cache] listing persist skipped:', err)
        })
        return { listing: withFreshTax(live), source: 'rets' }
      }
    } catch (err) {
      console.warn('[spotlight-cache] RETS lookup failed — falling back to DB', err)
    }
  }

  if (dbListing) {
    return { listing: dbListing, source: 'db' }
  }
  if (cached?.listing) {
    return {
      listing: withFreshTax(cached.listing),
      source: cached.source ?? 'db',
    }
  }
  return { listing: null, source: 'db' }
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
