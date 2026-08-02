import 'server-only'

import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import {
  persistListingRecord,
  type ListingsSource,
} from '@/lib/listings-store'
import { getListingByMlsId, type Listing } from '@/lib/rets'
import type { SpotlightPropertyTabId } from '@/lib/spotlight-listing'

export type SpotlightIngestResult = {
  found: boolean
  /** Already present in Postgres before this call. */
  alreadyInDb: boolean
  /** True when this call wrote (or refreshed) the row in Postgres. */
  persisted: boolean
  /** Spotlight listing + photo cache rebuilt for the tab. */
  cacheWarmed: boolean
  source: ListingsSource | 'none'
  listing: Listing | null
  error?: string
}

/**
 * One-off marketing ingest: if the MLS # is not in Postgres, pull it from
 * RETS immediately and await the Postgres upsert so Spotlight can be reviewed
 * for a client without waiting for the scheduled sync.
 */
export async function ensureSpotlightListingIngested(
  mlsId: string,
  options?: {
    propertyTab?: SpotlightPropertyTabId
    /** When true (default), rebuild spotlight listing + photo cache after upsert. */
    warmCache?: boolean
  },
): Promise<SpotlightIngestResult> {
  const id = mlsId.trim()
  const warmCache = options?.warmCache !== false
  const propertyTab = options?.propertyTab

  if (!id) {
    return {
      found: false,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'none',
      listing: null,
      error: 'MLS id required',
    }
  }

  let dbListing: Listing | null = null
  try {
    dbListing = await readListingByIdFromDb(id)
  } catch (err) {
    return {
      found: false,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'none',
      listing: null,
      error:
        err instanceof Error
          ? `Postgres unavailable: ${err.message}`
          : 'Postgres unavailable',
    }
  }

  if (dbListing) {
    let cacheWarmed = false
    if (warmCache && propertyTab != null) {
      const { rebuildSpotlightCache } = await import('@/lib/spotlight-cache')
      cacheWarmed = await rebuildSpotlightCache(propertyTab).catch(() => false)
    }
    return {
      found: true,
      alreadyInDb: true,
      persisted: false,
      cacheWarmed,
      source: 'db',
      listing: dbListing,
    }
  }

  let live: Listing | null = null
  try {
    live = await getListingByMlsId(id)
  } catch (err) {
    console.error('[spotlight-ingest] RETS fetch failed', id, err)
    return {
      found: false,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'none',
      listing: null,
      error:
        err instanceof Error
          ? `RETS fetch failed: ${err.message}`
          : 'RETS fetch failed',
    }
  }

  if (!live) {
    return {
      found: false,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'none',
      listing: null,
    }
  }

  // Hot cache first — public /spotlight must work even if Neon upsert stalls.
  try {
    const { writeSpotlightCache } = await import('@/lib/spotlight-cache')
    await writeSpotlightCache(id, {
      listing: live,
      source: 'rets',
      cachedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[spotlight-ingest] hot cache write failed', id, err)
  }

  // Await Postgres write — do not fire-and-forget for client-review urgency.
  let persisted = false
  try {
    persisted = await persistListingRecord(live)
  } catch (err) {
    console.error('[spotlight-ingest] Postgres upsert failed', id, err)
    return {
      found: true,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'rets',
      listing: live,
      error:
        err instanceof Error
          ? `Postgres upsert failed: ${err.message}`
          : 'Postgres upsert failed',
    }
  }

  if (!persisted) {
    return {
      found: true,
      alreadyInDb: false,
      persisted: false,
      cacheWarmed: false,
      source: 'rets',
      listing: live,
      error: 'Listing fetched from RETS but Postgres upsert returned false',
    }
  }

  // Optional warm — caller usually writes the Spotlight override first, then
  // rebuilds cache so resolveSpotlightMlsId sees the new MLS id.
  let cacheWarmed = false
  if (warmCache && propertyTab != null) {
    const listingKey = live.listingKey || id
    await resolveListingPhotoUrls(id, listingKey, live.photoCount, {
      size: 'full',
    }).catch((err) => {
      console.warn('[spotlight-ingest] photo warm skipped', id, err)
    })
    const { rebuildSpotlightCache } = await import('@/lib/spotlight-cache')
    cacheWarmed = await rebuildSpotlightCache(propertyTab).catch((err) => {
      console.warn('[spotlight-ingest] spotlight cache rebuild skipped', err)
      return false
    })
  }

  return {
    found: true,
    alreadyInDb: false,
    persisted: true,
    cacheWarmed,
    source: 'rets',
    listing: live,
  }
}
