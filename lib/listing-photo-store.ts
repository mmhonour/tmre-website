import 'server-only'

import {
  countFreshListingPhotos,
  listingPhotoStorageSpan,
  readListingPhotoBlob,
  upsertListingPhotoBlob,
} from '@/lib/listings-db'
import {
  isListingPhotoFresh,
  LISTING_PHOTO_TTL_MS,
  listingPhotoSyncedAfter,
} from '@/lib/listing-photo-ttl'
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
        const items: unknown[] = Array.isArray(all)
          ? all
          : Array.isArray((all as { objects?: unknown[] })?.objects)
            ? (all as { objects: unknown[] }).objects
            : []
        const item = items[photoIndex]
        return bufferFromRetsItem(item)
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
  upsertListingPhotoBlob(mlsId, photoIndex, source.data, source.contentType)
  return { ...source, cacheHit: false }
}

async function fetchPhotoFromSources(
  id: string,
  listingKey: string,
  photoIndex: number,
): Promise<{ data: Buffer; contentType: string } | null> {
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

export type ResolveListingPhotoOptions = {
  mlsId: string
  listingKey: string
  photoIndex: number
  photoCountHint?: number | null
  forceRefresh?: boolean
}

/** SQLite blob first — refresh from media/RETS only when missing or older than 30 minutes. */
export async function resolveListingPhotoBuffer(
  options: ResolveListingPhotoOptions,
): Promise<{ data: Buffer; contentType: string; cacheHit: boolean } | null> {
  const id = options.mlsId.trim()
  const listingKey = options.listingKey.trim() || id
  const { photoIndex } = options
  if (!id || photoIndex < 0) return null

  const cached = readListingPhotoBlob(id, photoIndex)
  const cacheFresh =
    cached != null &&
    isListingPhotoFresh(cached.syncedAt) &&
    !options.forceRefresh

  if (cacheFresh && cached) {
    return {
      data: cached.data,
      contentType: cached.contentType,
      cacheHit: true,
    }
  }

  const fetched = await fetchPhotoFromSources(id, listingKey, photoIndex)
  if (fetched) {
    return fetchAndPersistPhotoBuffer(id, photoIndex, fetched)
  }

  if (cached) {
    return {
      data: cached.data,
      contentType: cached.contentType,
      cacheHit: true,
    }
  }

  return null
}

export function listingPhotoCacheId(listing: {
  mlsId: string
  listingKey?: string | null
}): string {
  return listing.listingKey?.trim() || listing.mlsId.trim()
}

/** True when every expected index is stored and synced within the TTL window. */
export function listingPhotosFullyCached(
  cacheId: string,
  photoCountHint?: number | null,
  ttlMs = LISTING_PHOTO_TTL_MS,
): boolean {
  const id = cacheId.trim()
  const expected = photoCountHint ?? 0
  if (!id || expected <= 0) return false
  return (
    countFreshListingPhotos(id, expected, listingPhotoSyncedAfter(ttlMs)) >=
    expected
  )
}

/** True when any stored photo for this listing is past the refresh interval. */
export function listingPhotosNeedRefresh(
  cacheId: string,
  photoCountHint?: number | null,
  ttlMs = LISTING_PHOTO_TTL_MS,
): boolean {
  const id = cacheId.trim()
  const expected = photoCountHint ?? listingPhotoStorageSpan(id)
  if (!id || expected <= 0) return true
  return !listingPhotosFullyCached(id, expected, ttlMs)
}

/** Read up to maxPhotos fresh blobs from SQLite (no RETS). */
export function readCachedListingPhotoBuffers(
  mlsId: string,
  maxPhotos: number,
  ttlMs = LISTING_PHOTO_TTL_MS,
): Buffer[] {
  const id = mlsId.trim()
  if (!id || maxPhotos <= 0) return []
  const span = listingPhotoStorageSpan(id)
  const limit = Math.min(maxPhotos, span)
  const buffers: Buffer[] = []
  for (let i = 0; i < limit; i++) {
    const row = readListingPhotoBlob(id, i)
    if (row && isListingPhotoFresh(row.syncedAt, ttlMs)) {
      buffers.push(row.data)
    }
  }
  return buffers
}
