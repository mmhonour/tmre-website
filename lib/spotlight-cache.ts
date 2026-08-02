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

function isFresh(iso: string | undefined, ttlMs: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < ttlMs
}

/** Reject legacy CDN photo caches so we resync from SQLite proxy paths. */
function photosAreLocalProxy(photos: string[] | undefined): boolean {
  if (!photos || photos.length === 0) return false
  return photos.every((url) => url.startsWith('/api/listings/'))
}

/**
 * Load Spotlight listing facts.
 *
 * Default order: Postgres → RETS → stale hot cache.
 * Hot cache is written as soon as RETS returns so a busy incremental sync
 * cannot blank an Admin-assigned slot (Spotlight #4/#5).
 * `forceRefresh` prefers RETS first (Admin rebuild / explicit refresh).
 */
async function loadSpotlightListingRecord(
  mlsId: string,
  cached: SpotlightCachePayload | null,
  forceRefresh: boolean,
): Promise<{ listing: Listing | null; source: ListingsSource }> {
  if (!forceRefresh) {
    try {
      const { listing: dbListing } = await readListingFromDbByMlsId(mlsId)
      if (dbListing) {
        return { listing: dbListing, source: 'db' }
      }
    } catch (err) {
      console.warn('[spotlight-cache] DB read failed:', err)
    }
  }

  try {
    const live = await getListingByMlsId(mlsId)
    if (live) {
      const fresh = withFreshTax(live)
      // Hot cache before Postgres upsert — public page must not wait on Neon.
      try {
        await writeSpotlightCache(mlsId, {
          listing: fresh,
          photos: cached?.photos,
          source: 'rets',
          cachedAt: new Date().toISOString(),
          photosCachedAt: cached?.photosCachedAt,
        })
      } catch (err) {
        console.warn('[spotlight-cache] hot cache write failed:', err)
      }
      try {
        await persistListingRecord(live)
      } catch (err) {
        console.warn('[spotlight-cache] listing persist failed:', err)
      }
      return { listing: fresh, source: 'rets' }
    }
  } catch (err) {
    console.warn('[spotlight-cache] RETS lookup failed — falling back', err)
  }

  if (forceRefresh) {
    try {
      const { listing: dbListing } = await readListingFromDbByMlsId(mlsId)
      if (dbListing) {
        return { listing: dbListing, source: 'db' }
      }
    } catch (err) {
      console.warn('[spotlight-cache] DB read failed after RETS:', err)
    }
  }

  if (cached?.listing) {
    return {
      listing: withFreshTax(cached.listing),
      source: cached.source ?? 'db',
    }
  }
  return { listing: null, source: 'db' }
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
  const forceRefresh = options.forceRefresh === true
  const mlsId = await resolveSpotlightMlsId(config)
  if (!mlsId) {
    return { listing: null, photos: [], source: 'db', cacheHit: false }
  }

  const cached = forceRefresh ? null : await readSpotlightCache(mlsId)
  const photosFresh =
    photosAreLocalProxy(cached?.photos) &&
    isFresh(cached?.photosCachedAt, SPOTLIGHT_PHOTOS_TTL_MS)

  // Serve hot cache immediately when fresh — do not wait on RETS (incremental
  // sync often holds the RETS client and blanked Admin-assigned slots).
  if (
    !forceRefresh &&
    cached?.listing &&
    isFresh(cached.cachedAt, SPOTLIGHT_LISTING_TTL_MS)
  ) {
    return {
      listing: withFreshTax(cached.listing),
      photos: options.includePhotos ? (cached.photos ?? []) : [],
      source: cached.source ?? 'db',
      cacheHit: true,
    }
  }

  let { listing, source } = await loadSpotlightListingRecord(
    mlsId,
    cached,
    forceRefresh,
  )

  // Last resort: one-off ingest (RETS → hot cache → Postgres). Use the RETS
  // listing even when Postgres upsert fails so the public page is not blank.
  if (!listing) {
    try {
      const { ensureSpotlightListingIngested } = await import(
        '@/lib/spotlight-listing-ingest'
      )
      const ingest = await ensureSpotlightListingIngested(mlsId, {
        warmCache: false,
      })
      if (ingest.listing) {
        listing = withFreshTax(ingest.listing)
        source = ingest.source === 'none' ? 'rets' : ingest.source
        try {
          await writeSpotlightCache(mlsId, {
            listing,
            photos: cached?.photos,
            source,
            cachedAt: new Date().toISOString(),
            photosCachedAt: cached?.photosCachedAt,
          })
        } catch (err) {
          console.warn('[spotlight-cache] hot cache after ingest failed:', err)
        }
      }
    } catch (err) {
      console.warn('[spotlight-cache] one-off ingest failed:', err)
    }
  }

  let photos = photosFresh ? (cached!.photos ?? []) : []
  let photosCachedAt = photosFresh ? cached!.photosCachedAt : undefined

  if (options.includePhotos && listing && !photosFresh) {
    const resolved = await resolveListingPhotoUrls(
      mlsId,
      listing.listingKey || mlsId,
      listing.photoCount,
      { size: 'full' },
    )
    photos = resolved.photos
    photosCachedAt = new Date().toISOString()
  }

  // Never overwrite a good hot cache with a null listing miss.
  if (listing) {
    await writeSpotlightCache(mlsId, {
      listing,
      photos: photos.length > 0 ? photos : cached?.photos,
      source,
      cachedAt: new Date().toISOString(),
      photosCachedAt: photosCachedAt ?? cached?.photosCachedAt,
    })
  }

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
