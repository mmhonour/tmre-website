import 'server-only'

import {
  countFreshListingPhotosAsync,
  listingPhotoStorageSpanAsync,
  listStoredListingPhotoIndicesAsync,
  readListingPhotoBytes,
  storeListingPhoto,
  type PhotoBytes,
} from '@/lib/listing-photo-backend'
import {
  isListingPhotoFresh,
  LISTING_PHOTO_TTL_MS,
  listingPhotoSyncedAfter,
} from '@/lib/listing-photo-ttl'
import { getListingPhotoTtlMs } from '@/lib/listing-photo-ttl-config'
import { fetchMediaPhotoUrlForIndex, withRetsClient } from '@/lib/rets'

export { LISTING_PHOTO_TTL_MS, isListingPhotoFresh }

const PHOTO_TYPES_FULL = ['Photo', 'LargePhoto', 'HiRes', 'Thumbnail'] as const
const PHOTO_TYPES_THUMB = ['Thumbnail', 'Photo', 'LargePhoto', 'HiRes'] as const

function bufferFromRetsItem(item: unknown): Buffer | null {
  if (!item || typeof item !== 'object') return null
  const row = item as { dataBuffer?: Buffer; data?: Buffer }
  const buf = row.dataBuffer ?? row.data ?? (Buffer.isBuffer(item) ? item : null)
  return buf instanceof Buffer && buf.length > 100 ? buf : null
}

function retsObjectItems(all: unknown): unknown[] {
  const items: unknown[] = Array.isArray(all)
    ? all
    : Array.isArray((all as { objects?: unknown[] })?.objects)
      ? (all as { objects: unknown[] }).objects
      : []
  // SmartMLS sometimes returns a null/empty slot at [0]; index into valid buffers only.
  return items.filter((item) => bufferFromRetsItem(item) != null)
}

/** Fetch one photo index from SmartMLS RETS object resources. */
export async function fetchListingPhotoBufferFromRets(
  listingKey: string,
  photoIndex: number,
  options: { preferThumbnail?: boolean } = {},
): Promise<{ data: Buffer; contentType: string } | null> {
  const key = listingKey.trim()
  if (!key || photoIndex < 0) return null

  const types = options.preferThumbnail ? PHOTO_TYPES_THUMB : PHOTO_TYPES_FULL

  for (const photoType of types) {
    try {
      const result = await withRetsClient(async (client) => {
        const all = await client.objects.getAllObjects(
          'Property',
          photoType,
          key,
          { Location: 0, alwaysGroupObjects: true },
        )
        return bufferFromRetsItem(retsObjectItems(all)[photoIndex])
      })
      if (result) {
        return { data: result, contentType: 'image/jpeg' }
      }
    } catch {
      // try next type
    }
  }
  return null
}

async function fetchListingPhotoBufferFromUrl(
  url: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer())
    if (data.length < 100) return null
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    return { data, contentType }
  } catch {
    return null
  }
}

async function fetchAndPersistPhotoBuffer(
  mlsId: string,
  photoIndex: number,
  source: { data: Buffer; contentType: string },
): Promise<{ data: Buffer; contentType: string; cacheHit: boolean }> {
  await storeListingPhoto(mlsId, photoIndex, source.data, source.contentType)
  return { ...source, cacheHit: false }
}

export type ListingPhotoQuality = 'display' | 'full'

async function fetchPhotoFromSources(
  id: string,
  listingKey: string,
  photoIndex: number,
  quality: ListingPhotoQuality = 'display',
): Promise<{ data: Buffer; contentType: string } | null> {
  // Gallery / full-view: MLS Media CDN only (MediaURL). Never RETS object digests.
  if (quality === 'full') {
    const fullUrl = await fetchMediaPhotoUrlForIndex(
      listingKey,
      id,
      photoIndex,
      'full',
    )
    if (fullUrl) {
      const fromFull = await fetchListingPhotoBufferFromUrl(fullUrl)
      if (fromFull) return fromFull
    }
    const midUrl = await fetchMediaPhotoUrlForIndex(
      listingKey,
      id,
      photoIndex,
      'mid',
    )
    if (midUrl && midUrl !== fullUrl) {
      const fromMid = await fetchListingPhotoBufferFromUrl(midUrl)
      if (fromMid) return fromMid
    }
    return null
  }

  const isThumbSlot = photoIndex > 0
  const mediaSize = isThumbSlot ? 'thumb' : 'full'
  const mediaUrl = await fetchMediaPhotoUrlForIndex(
    listingKey,
    id,
    photoIndex,
    mediaSize,
  )
  if (mediaUrl) {
    const fromUrl = await fetchListingPhotoBufferFromUrl(mediaUrl)
    if (fromUrl) return fromUrl
  }

  if (isThumbSlot) {
    const midUrl = await fetchMediaPhotoUrlForIndex(
      listingKey,
      id,
      photoIndex,
      'mid',
    )
    if (midUrl && midUrl !== mediaUrl) {
      const fromMid = await fetchListingPhotoBufferFromUrl(midUrl)
      if (fromMid) return fromMid
    }
  }

  return fetchListingPhotoBufferFromRets(listingKey, photoIndex, {
    preferThumbnail: isThumbSlot,
  })
}

/**
 * Cached thumbs for index > 0 are often ~10–60KB. Full CDN MediaURL JPEGs are
 * typically much larger — use this floor so `size=full` does not reuse a thumb.
 */
const FULL_QUALITY_MIN_BYTES = 80_000

export type ResolveListingPhotoOptions = {
  mlsId: string
  listingKey: string
  photoIndex: number
  photoCountHint?: number | null
  forceRefresh?: boolean
  /** When true, only return already-cached bytes (no RETS/media fetch). */
  sqliteOnly?: boolean
  /**
   * `full` — gallery / full-view: prefer CDN MediaURL and refuse undersized
   * thumb cache hits. `display` — hero/deck thumbs (index > 0 may be Thumbnail).
   */
  quality?: ListingPhotoQuality
  /** Extra cache ids to probe (e.g. MLS id when primary key is listingKey). */
  alternateCacheIds?: readonly string[]
}

function asPhotoResult(
  row: PhotoBytes,
  cacheHit: boolean,
): { data: Buffer; contentType: string; cacheHit: boolean } {
  return {
    data: row.data,
    contentType: row.contentType,
    cacheHit,
  }
}

function cacheSatisfiesQuality(
  row: PhotoBytes,
  quality: ListingPhotoQuality,
): boolean {
  if (quality !== 'full') return true
  return row.data.length >= FULL_QUALITY_MIN_BYTES
}

async function readCachedPhotoAcrossIds(
  primaryId: string,
  photoIndex: number,
  alternateCacheIds?: readonly string[],
): Promise<{ cacheId: string; row: PhotoBytes } | null> {
  const ids = [
    primaryId,
    ...(alternateCacheIds ?? []).map((v) => v.trim()).filter(Boolean),
  ]
  const seen = new Set<string>()
  for (const cacheId of ids) {
    if (!cacheId || seen.has(cacheId)) continue
    seen.add(cacheId)
    const row = await readListingPhotoBytes(cacheId, photoIndex)
    if (row) return { cacheId, row }
  }
  return null
}

/** Cached bytes first — refresh from media/RETS only when missing or past the configured TTL. */
export async function resolveListingPhotoBuffer(
  options: ResolveListingPhotoOptions,
): Promise<{ data: Buffer; contentType: string; cacheHit: boolean } | null> {
  const id = options.mlsId.trim()
  const listingKey = options.listingKey.trim() || id
  const { photoIndex } = options
  const quality: ListingPhotoQuality = options.quality ?? 'display'
  if (!id || photoIndex < 0) return null

  const cachedHit = await readCachedPhotoAcrossIds(
    id,
    photoIndex,
    options.alternateCacheIds,
  )
  const cached = cachedHit?.row ?? null
  const cacheFresh =
    cached != null &&
    isListingPhotoFresh(cached.syncedAt, getListingPhotoTtlMs()) &&
    !options.forceRefresh &&
    cacheSatisfiesQuality(cached, quality)

  if (cacheFresh && cached) {
    return asPhotoResult(cached, true)
  }

  if (options.sqliteOnly) {
    // Do not hand gallery a fresh-but-tiny thumb as if it were full-res.
    if (cached && cacheSatisfiesQuality(cached, quality)) {
      return asPhotoResult(cached, true)
    }
    return null
  }

  const fetched = await fetchPhotoFromSources(id, listingKey, photoIndex, quality)
  if (fetched) {
    return fetchAndPersistPhotoBuffer(id, photoIndex, fetched)
  }

  // Empty RETS/media slots stay missing — galleries omit them instead of
  // fabricating a duplicate from a neighboring index.
  // Last resort for display only: serve a stale/undersized cache hit.
  if (cached && quality === 'display') {
    return asPhotoResult(cached, true)
  }

  return null
}

export function listingPhotoCacheId(listing: {
  mlsId: string
  listingKey?: string | null
}): string {
  return listing.listingKey?.trim() || listing.mlsId.trim()
}

function listingPhotoIndicesAreContiguous(indices: readonly number[]): boolean {
  if (indices.length === 0) return false
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1) return false
  }
  return true
}

/**
 * True when stored photos are fresh. Empty RETS object slots (leading/trailing
 * holes that never download) do not keep this false forever — only interior gaps do.
 */
export async function listingPhotosFullyCached(
  cacheId: string,
  photoCountHint?: number | null,
  ttlMs = getListingPhotoTtlMs(),
): Promise<boolean> {
  const id = cacheId.trim()
  if (!id) return false
  const indices = await listStoredListingPhotoIndicesAsync(id)
  const stored = indices.length
  if (stored <= 0) return false
  const span = await listingPhotoStorageSpanAsync(id)
  const fresh = await countFreshListingPhotosAsync(id, span, listingPhotoSyncedAfter(ttlMs))
  if (fresh < stored) return false
  if (!listingPhotoIndicesAreContiguous(indices)) return false

  const min = indices[0]!
  const max = indices[indices.length - 1]!
  const expected = photoCountHint ?? 0
  if (expected <= 0) return true
  // Full contiguous 0..expected-1
  if (min === 0 && stored >= expected) return true
  // Contiguous run ending at the MLS last slot — missing leading RETS empties only
  if (max === expected - 1 && stored === max - min + 1) return true
  // Contiguous run covering every MLS slot from 0 without interior holes
  if (min === 0 && max === stored - 1 && stored >= expected) return true
  return false
}

/** True when any stored photo for this listing is past the refresh interval. */
export async function listingPhotosNeedRefresh(
  cacheId: string,
  photoCountHint?: number | null,
  ttlMs = getListingPhotoTtlMs(),
): Promise<boolean> {
  const id = cacheId.trim()
  const expected = photoCountHint ?? (await listingPhotoStorageSpanAsync(id))
  if (!id || expected <= 0) return true
  return !(await listingPhotosFullyCached(id, expected, ttlMs))
}

/** Read up to maxPhotos fresh photo blobs from the cache (no RETS). */
export async function readCachedListingPhotoBuffers(
  mlsId: string,
  maxPhotos: number,
  ttlMs = LISTING_PHOTO_TTL_MS,
): Promise<Buffer[]> {
  const id = mlsId.trim()
  if (!id || maxPhotos <= 0) return []
  const indices = (await listStoredListingPhotoIndicesAsync(id)).slice(0, maxPhotos)
  const buffers: Buffer[] = []
  for (const index of indices) {
    const row = await readListingPhotoBytes(id, index)
    if (row && isListingPhotoFresh(row.syncedAt, ttlMs)) {
      buffers.push(row.data)
    }
  }
  return buffers
}
