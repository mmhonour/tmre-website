import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import {
  getSyncMeta,
  setSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'

/** Rolling window for proxy hit/miss/fetch counters (short-lived Admin signal). */
const PHOTO_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000
export const PHOTO_HEALTH_META_KEY = 'listing_photo_proxy_health_v1'

export type PhotoProxyHealthCounters = {
  windowStartedAt: string
  lastUpdatedAt: string
  cacheHits: number
  cacheMisses: number
  fetchOk: number
  fetchFail: number
}

export type PhotoColdGapSample = {
  mlsId: string
  listingKey: string | null
  town: string | null
  photoCount: number
  status: string | null
}

export type PhotoColdGapStats = {
  /** Active (+ Coming Soon bucket) rows with photoCount > 0 but zero stored photos. */
  activeMissingStored: number
  /** Sample MLS ids for triage (newest mods first). */
  samples: PhotoColdGapSample[]
  measuredAt: string
}

function emptyCounters(now = new Date()): PhotoProxyHealthCounters {
  const iso = now.toISOString()
  return {
    windowStartedAt: iso,
    lastUpdatedAt: iso,
    cacheHits: 0,
    cacheMisses: 0,
    fetchOk: 0,
    fetchFail: 0,
  }
}

function parseCounters(raw: string | null): PhotoProxyHealthCounters {
  if (!raw) return emptyCounters()
  try {
    const parsed = JSON.parse(raw) as Partial<PhotoProxyHealthCounters>
    if (
      typeof parsed.windowStartedAt !== 'string' ||
      typeof parsed.cacheHits !== 'number'
    ) {
      return emptyCounters()
    }
    return {
      windowStartedAt: parsed.windowStartedAt,
      lastUpdatedAt:
        typeof parsed.lastUpdatedAt === 'string'
          ? parsed.lastUpdatedAt
          : parsed.windowStartedAt,
      cacheHits: parsed.cacheHits ?? 0,
      cacheMisses: parsed.cacheMisses ?? 0,
      fetchOk: parsed.fetchOk ?? 0,
      fetchFail: parsed.fetchFail ?? 0,
    }
  } catch {
    return emptyCounters()
  }
}

function rollWindow(counters: PhotoProxyHealthCounters): PhotoProxyHealthCounters {
  const started = Date.parse(counters.windowStartedAt)
  if (!Number.isFinite(started) || Date.now() - started > PHOTO_HEALTH_WINDOW_MS) {
    return emptyCounters()
  }
  return counters
}

export type PhotoProxyOutcome =
  | 'cache-hit'
  | 'cache-miss'
  | 'fetch-ok'
  | 'fetch-fail'

/** Fire-and-forget counter bump for the Admin photo health panel (24h window). */
export function recordPhotoProxyOutcome(outcome: PhotoProxyOutcome): void {
  try {
    const next = rollWindow(parseCounters(getSyncMeta(PHOTO_HEALTH_META_KEY)))
    if (outcome === 'cache-hit') next.cacheHits += 1
    else if (outcome === 'cache-miss') next.cacheMisses += 1
    else if (outcome === 'fetch-ok') next.fetchOk += 1
    else next.fetchFail += 1
    next.lastUpdatedAt = new Date().toISOString()
    setSyncMeta(PHOTO_HEALTH_META_KEY, JSON.stringify(next))
  } catch {
    /* best-effort */
  }
}

export function readPhotoProxyHealthCounters(): PhotoProxyHealthCounters {
  return rollWindow(parseCounters(getSyncMeta(PHOTO_HEALTH_META_KEY)))
}

/** Active inventory that claims photos but has nothing in listing_photo_index. */
export async function readPhotoColdGapStats(
  sampleLimit = 8,
): Promise<PhotoColdGapStats> {
  const measuredAt = new Date().toISOString()
  try {
    const countRow = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM listings l
        WHERE l.status_bucket = 'Active'
          AND COALESCE(l.photo_count, 0) > 0
          AND NOT EXISTS (
            SELECT 1
              FROM listing_photo_index p
             WHERE p.byte_length >= 100
               AND (
                 p.cache_id = NULLIF(BTRIM(COALESCE(l.listing_key, '')), '')
                 OR p.cache_id = l.mls_id
                 OR p.cache_id = l.id
               )
          )`,
    )

    const samples = await query<{
      mls_id: string
      listing_key: string | null
      town: string | null
      photo_count: number
      mls_status: string | null
    }>(
      `SELECT l.mls_id,
              NULLIF(BTRIM(COALESCE(l.listing_key, '')), '') AS listing_key,
              l.town,
              l.photo_count::int AS photo_count,
              l.mls_status
         FROM listings l
        WHERE l.status_bucket = 'Active'
          AND COALESCE(l.photo_count, 0) > 0
          AND NOT EXISTS (
            SELECT 1
              FROM listing_photo_index p
             WHERE p.byte_length >= 100
               AND (
                 p.cache_id = NULLIF(BTRIM(COALESCE(l.listing_key, '')), '')
                 OR p.cache_id = l.mls_id
                 OR p.cache_id = l.id
               )
          )
        ORDER BY l.modification_timestamp DESC NULLS LAST
        LIMIT $1`,
      [Math.max(1, Math.min(20, sampleLimit))],
    )

    return {
      activeMissingStored: countRow?.n ?? 0,
      samples: samples.map((row) => ({
        mlsId: row.mls_id,
        listingKey: row.listing_key,
        town: row.town,
        photoCount: row.photo_count,
        status: row.mls_status,
      })),
      measuredAt,
    }
  } catch (err) {
    console.error('[listing-photo-health] cold-gap query failed', err)
    return { activeMissingStored: 0, samples: [], measuredAt }
  }
}

export async function resetPhotoProxyHealthCounters(): Promise<void> {
  await setSyncMetaDurable(PHOTO_HEALTH_META_KEY, JSON.stringify(emptyCounters()))
}
