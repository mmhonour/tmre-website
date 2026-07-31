import 'server-only'

import {
  CLOSED_LISTINGS_FETCH_LIMIT,
  CLOSED_LISTINGS_SINCE,
  EXPIRED_LISTINGS_FETCH_LIMIT,
  EXPIRED_MLS_STATUS,
  isClosedListing,
  isExpiredListing,
} from '@/lib/listings-store'
import { searchListings, type Listing } from '@/lib/rets'
import type { TmreTown } from '@/lib/tmre-towns'

export type StatusChangeWindow = {
  after: string
  before: string
  label: string
}

/**
 * Calendar-year StatusChangeTimestamp windows from {@link CLOSED_LISTINGS_SINCE}
 * through today. RETS returns a capped oldest-first page — a single 2019→now
 * pull drops the middle years (often 2022–2023). Year chunks keep each page full.
 */
export function closedStatusChangeWindows(options?: {
  sinceIso?: string
  years?: readonly number[]
  now?: Date
}): StatusChangeWindow[] {
  const now = options?.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  if (options?.years && options.years.length > 0) {
    return [...options.years]
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b)
      .map((y) => ({
        after: `${y}-01-01`,
        before: y === now.getFullYear() ? today : `${y}-12-31`,
        label: String(y),
      }))
  }
  const since = (options?.sinceIso ?? CLOSED_LISTINGS_SINCE).slice(0, 10)
  const startYear = Number(since.slice(0, 4))
  const endYear = now.getFullYear()
  if (!Number.isFinite(startYear) || startYear > endYear) {
    return [{ after: since, before: today, label: since.slice(0, 4) }]
  }
  const windows: StatusChangeWindow[] = []
  for (let y = startYear; y <= endYear; y++) {
    windows.push({
      after: y === startYear ? since : `${y}-01-01`,
      before: y === endYear ? today : `${y}-12-31`,
      label: String(y),
    })
  }
  return windows
}

function mergeByListingKey(...groups: Listing[][]): Listing[] {
  const seen = new Set<string>()
  const merged: Listing[] = []
  for (const group of groups) {
    for (const l of group) {
      const key = l.listingKey || l.mlsId
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(l)
    }
  }
  return merged
}

/**
 * Closed sales for one town, one RETS page per calendar year (plus optional
 * explicit years). Prefer this over a single bulk+recent merge.
 */
export async function fetchClosedListingsForTownYearWindows(
  town: TmreTown,
  options: {
    limit?: number
    years?: readonly number[]
    /** When false, pull windows sequentially (gentler on RETS). Default true. */
    parallel?: boolean
  } = {},
): Promise<Listing[]> {
  const limit = options.limit ?? CLOSED_LISTINGS_FETCH_LIMIT
  const windows = closedStatusChangeWindows({ years: options.years })
  const pull = async (w: StatusChangeWindow): Promise<Listing[]> => {
    try {
      const rows = await searchListings({
        city: town,
        status: 'Closed',
        limit,
        closedAfter: w.after,
        closedBefore: w.before,
      })
      const closed = rows.filter(isClosedListing)
      console.info(
        `[closed-listings-rets] ${town} Closed ${w.label}: ${closed.length}/${rows.length} (limit ${limit})`,
      )
      return closed
    } catch (err) {
      console.warn(
        `[closed-listings-rets] ${town} Closed ${w.label} failed`,
        err,
      )
      return []
    }
  }

  if (options.parallel === false) {
    const batches: Listing[][] = []
    for (const w of windows) {
      batches.push(await pull(w))
    }
    return mergeByListingKey(...batches)
  }

  const batches = await Promise.all(windows.map(pull))
  return mergeByListingKey(...batches)
}

/**
 * Expired listings year-chunked the same way — needed so active-by-month can
 * reconstruct seasonal inventory that never closed.
 */
export async function fetchExpiredListingsForTownYearWindows(
  town: TmreTown,
  options: {
    limit?: number
    years?: readonly number[]
    parallel?: boolean
  } = {},
): Promise<Listing[]> {
  const limit = options.limit ?? Math.max(EXPIRED_LISTINGS_FETCH_LIMIT, 2000)
  const windows = closedStatusChangeWindows({ years: options.years })
  const pull = async (w: StatusChangeWindow): Promise<Listing[]> => {
    try {
      const rows = await searchListings({
        city: town,
        status: EXPIRED_MLS_STATUS,
        limit,
        closedAfter: w.after,
        closedBefore: w.before,
      })
      const expired = rows.filter(isExpiredListing)
      console.info(
        `[closed-listings-rets] ${town} Expired ${w.label}: ${expired.length}/${rows.length}`,
      )
      return expired
    } catch (err) {
      console.warn(
        `[closed-listings-rets] ${town} Expired ${w.label} failed`,
        err,
      )
      return []
    }
  }

  if (options.parallel === false) {
    const batches: Listing[][] = []
    for (const w of windows) {
      batches.push(await pull(w))
    }
    return mergeByListingKey(...batches)
  }

  const batches = await Promise.all(windows.map(pull))
  return mergeByListingKey(...batches)
}
