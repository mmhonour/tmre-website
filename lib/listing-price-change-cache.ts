import 'server-only'

import {
  readStatsCacheRows,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { query } from '@/lib/db/postgres'
import {
  computeListingPriceChange,
  type ListingPriceChange,
} from '@/lib/listing-price-change'

/** stats_cache key prefix — preserved across hourly stats rebuilds. */
export const LISTING_PRICE_CHANGE_CACHE_PREFIX = 'listing-price-change:v1:'

export type ListingPriceChangeCachePayload = ListingPriceChange & {
  version: 1
  listingId: string
  mlsId: string
}

export function listingPriceChangeCacheKey(listingId: string): string {
  return `${LISTING_PRICE_CHANGE_CACHE_PREFIX}${listingId}`
}

function parsePayload(raw: unknown): ListingPriceChangeCachePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<ListingPriceChangeCachePayload>
  if (p.version !== 1) return null
  if (typeof p.listingId !== 'string' || !p.listingId.trim()) return null
  if (typeof p.previousPrice !== 'number' || typeof p.currentPrice !== 'number') {
    return null
  }
  if (typeof p.amount !== 'number' || typeof p.percent !== 'number') return null
  if (p.direction !== 'reduced' && p.direction !== 'increased') return null
  return {
    version: 1,
    listingId: p.listingId,
    mlsId: typeof p.mlsId === 'string' ? p.mlsId : '',
    previousPrice: p.previousPrice,
    currentPrice: p.currentPrice,
    amount: p.amount,
    percent: p.percent,
    direction: p.direction,
    changedAt: typeof p.changedAt === 'string' ? p.changedAt : null,
  }
}

/** Overwrite the temporal price-change calc for one listing (wipes the prior). */
export async function writeListingPriceChange(opts: {
  listingId: string
  mlsId: string
  previousPrice: number | null | undefined
  currentPrice: number | null | undefined
  changedAt?: string | null
}): Promise<ListingPriceChangeCachePayload | null> {
  const change = computeListingPriceChange(
    opts.previousPrice,
    opts.currentPrice,
    opts.changedAt ?? null,
  )
  if (!change) return null
  const payload: ListingPriceChangeCachePayload = {
    version: 1,
    listingId: opts.listingId,
    mlsId: opts.mlsId,
    ...change,
  }
  await writeStatsCacheRow(listingPriceChangeCacheKey(opts.listingId), payload)
  return payload
}

/** Batch write after sync — each listing key is replaced independently. */
export async function writeListingPriceChanges(
  entries: Array<{
    listingId: string
    mlsId: string
    previousPrice: number | null | undefined
    currentPrice: number | null | undefined
    changedAt?: string | null
  }>,
): Promise<number> {
  let written = 0
  for (const entry of entries) {
    const payload = await writeListingPriceChange(entry)
    if (payload) written += 1
  }
  return written
}

/** Batch read from stats_cache. Missing keys are omitted. */
export async function readListingPriceChanges(
  listingIds: readonly string[],
): Promise<Map<string, ListingPriceChangeCachePayload>> {
  const out = new Map<string, ListingPriceChangeCachePayload>()
  const ids = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return out

  const keys = ids.map(listingPriceChangeCacheKey)
  const rows = await readStatsCacheRows(keys)
  for (const id of ids) {
    const row = rows.get(listingPriceChangeCacheKey(id))
    if (!row?.payload) continue
    let parsed: unknown = row.payload
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        continue
      }
    }
    const payload = parsePayload(parsed)
    if (payload) out.set(id, payload)
  }
  return out
}

/**
 * Latest price edge from listing_price_history (fallback when stats_cache is cold).
 * One row per listing — most recent price / price_status change.
 */
export async function readLatestPriceChangesFromHistory(
  listingIds: readonly string[],
): Promise<Map<string, ListingPriceChangeCachePayload>> {
  const out = new Map<string, ListingPriceChangeCachePayload>()
  const ids = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return out

  try {
    const rows = await query<{
      listing_id: string
      mls_id: string
      price: string | null
      previous_price: string | null
      observed_at: Date | string
    }>(
      `SELECT DISTINCT ON (listing_id)
              listing_id, mls_id, price, previous_price, observed_at
         FROM listing_price_history
        WHERE listing_id = ANY($1::text[])
          AND change_kind IN ('price', 'price_status')
          AND previous_price IS NOT NULL
          AND price IS NOT NULL
        ORDER BY listing_id, observed_at DESC, id DESC`,
      [ids],
    )
    for (const row of rows) {
      const previousPrice =
        row.previous_price != null ? Number(row.previous_price) : null
      const currentPrice = row.price != null ? Number(row.price) : null
      const changedAt =
        row.observed_at instanceof Date
          ? row.observed_at.toISOString()
          : String(row.observed_at)
      const change = computeListingPriceChange(
        previousPrice,
        currentPrice,
        changedAt,
      )
      if (!change) continue
      out.set(row.listing_id, {
        version: 1,
        listingId: row.listing_id,
        mlsId: row.mls_id,
        ...change,
      })
    }
  } catch (err) {
    // Table missing or transient — callers fall back to originalListPrice.
    if ((err as { code?: string })?.code !== '42P01') {
      console.warn('[listing-price-change] history fallback failed', err)
    }
  }
  return out
}

/**
 * Resolve last price change for listings: stats_cache first, then history.
 * Cold history hits are written back so the next read is a cache hit.
 */
export async function resolveListingPriceChanges(
  listingIds: readonly string[],
): Promise<Map<string, ListingPriceChangeCachePayload>> {
  const cached = await readListingPriceChanges(listingIds)
  const missing = listingIds.filter((id) => id.trim() && !cached.has(id.trim()))
  if (missing.length === 0) return cached

  const fromHistory = await readLatestPriceChangesFromHistory(missing)
  for (const [id, payload] of fromHistory) {
    cached.set(id, payload)
    // Best-effort warm — don't block the feed on a write failure.
    void writeStatsCacheRow(listingPriceChangeCacheKey(id), payload).catch(
      (err) => {
        console.warn('[listing-price-change] cache warm failed', id, err)
      },
    )
  }
  return cached
}
