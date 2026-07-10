import 'server-only'

import { readStatsCacheRow, searchListingsInDbByQuery, writeStatsCacheRow } from '@/lib/listings-db'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import {
  fetchListingByMlsId,
  persistListingRecord,
  type ListingsSource,
} from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { searchListings } from '@/lib/rets'
import {
  getSpotlightListingConfig,
  type SpotlightListingConfig,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'

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

function normalizeStreet(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function listingMatchesSpotlightAddress(
  listing: Listing,
  config: SpotlightListingConfig,
): boolean {
  const targetStreet = normalizeStreet(config.address.street)
  const targetCity = normalizeStreet(config.address.city)
  const listingStreet = normalizeStreet(
    listing.address.street || listing.address.full,
  )
  const listingCity = normalizeStreet(listing.address.city)
  if (!targetStreet || !listingStreet.includes(targetStreet)) return false
  if (targetCity && listingCity && listingCity !== targetCity) return false
  return true
}

/** DB-first, then RETS — for spotlight configs without a fixed MLS id. */
export async function resolveSpotlightMlsId(
  config: SpotlightListingConfig,
): Promise<string | null> {
  const fixed = config.mlsId?.trim()
  if (fixed) return fixed

  const query = config.address.street.trim()
  if (query.length < 2) return null

  const dbHits = searchListingsInDbByQuery(query, { limit: 20 })
  const dbMatch = dbHits.find((listing) =>
    listingMatchesSpotlightAddress(listing, config),
  )
  if (dbMatch?.mlsId?.trim()) return dbMatch.mlsId.trim()

  try {
    const retsHits = await searchListings({
      county: 'fairfield',
      addressContains: query,
      city: config.address.city,
      limit: 20,
    })
    const retsMatch = retsHits.find((listing) =>
      listingMatchesSpotlightAddress(listing, config),
    )
    return retsMatch?.mlsId?.trim() ?? null
  } catch (err) {
    console.warn('[spotlight-cache] RETS address lookup failed', err)
    return null
  }
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

  const cached = options.forceRefresh ? null : readSpotlightCache(mlsId)
  const listingFresh =
    cached?.listing != null &&
    isFresh(cached.cachedAt, SPOTLIGHT_LISTING_TTL_MS)
  const photosFresh =
    photosAreLocalProxy(cached?.photos) &&
    isFresh(cached?.photosCachedAt, SPOTLIGHT_PHOTOS_TTL_MS)

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
    const resolved = await resolveListingPhotoUrls(
      mlsId,
      listing.listingKey || mlsId,
      listing.photoCount,
    )
    photos = resolved.photos
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
