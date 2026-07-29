import 'server-only'

import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { listingRowId, type TownUpdateStat } from '@/lib/db/listings-repo'
import {
  readRecentlyListedListings,
  readRecentlyUpdatedListings,
  readTownUpdateStats,
  upsertListingScores,
  type RecentlyUpdatedRow,
} from '@/lib/db/listings-repo'
import { fetchActiveListingsForCity } from '@/lib/listings-store'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import type { Listing } from '@/lib/rets'
import { isTmreTown, normalizeZip, resolveListingTown, type TmreTown } from '@/lib/tmre-towns'
import { coerceLotAcres, parseLotAcresFromRaw } from '@/lib/listing-lot-acres'

export type LatestListingRow = {
  key: string
  listingKey: string | null
  mlsId: string
  score: number
  scoreBreakdown: ScoreBreakdown | null
  address: string
  city: string | null
  town: string | null
  zip: string | null
  type: string
  price: number
  pricePerSqft: number | null
  sqft: number | null
  lotAcres: number | null
  dom: number | null
  status: 'Active' | 'Pending' | 'New' | 'Reduced'
  isRental: boolean
  beds: number | null
  baths: number | null
  yearBuilt: number | null
  headline: string
  photoCount: number | null
  /** First downloaded photo index (skips empty RETS slots). */
  primaryPhotoIndex: number | null
  modificationTimestamp: string | null
  /** MLS list date — used so brand-new inventory stays in the 24h Latest window. */
  listDate: string | null
  syncedAt: string
}

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType)
}

function shortType(propertyType: string): string {
  const t = propertyType.replace(/ For Sale$/i, '').replace(/ For Lease$/i, ' (Lease)')
  if (/single family/i.test(t)) return 'SFR'
  if (/condo|co-op/i.test(t)) return 'Condo'
  if (/multi/i.test(t)) return 'Multi'
  if (/lots|land/i.test(t)) return 'Land'
  if (/rental/i.test(t)) return 'Rental'
  return t
}

function daysBetween(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function deriveStatus(
  listing: Listing,
  priceReductionPercent: number | null,
  daysOnMarket: number | null,
): LatestListingRow['status'] {
  const status = listing.status?.toLowerCase() ?? ''
  if (status === 'pending') return 'Pending'
  if (status === 'coming soon' || status === 'cs') return 'New'
  if ((priceReductionPercent ?? 0) > 1) return 'Reduced'
  if ((daysOnMarket ?? 99) <= 7) return 'New'
  return 'Active'
}

function townForListing(listing: Listing): TmreTown | null {
  const fromCity = resolveListingTown(listing.address.city)
  if (fromCity && isTmreTown(fromCity)) return fromCity
  return null
}

function parseStoredBreakdown(json: string | null | undefined): ScoreBreakdown | null {
  if (!json?.trim()) return null
  try {
    const parsed = JSON.parse(json) as ScoreBreakdown
    if (typeof parsed?.composite !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function toLatestRow(
  listing: Listing,
  score: ScoreBreakdown | null,
  modificationTimestamp: string | null,
  syncedAt: string,
  dbTown: string,
  storedScore: number | null = null,
): LatestListingRow | null {
  if (listing.price == null || listing.price <= 0) return null
  const rental = isRentalType(listing.propertyType)
  const pricePerSqft =
    !rental && listing.price && listing.sqft && listing.sqft > 0
      ? listing.price / listing.sqft
      : null
  const daysOnMarket =
    listing.dom != null
      ? listing.dom
      : daysBetween(listing.listDate ?? listing.modificationTimestamp)
  const priceReductionPercent =
    listing.originalListPrice &&
    listing.price &&
    listing.originalListPrice > 0 &&
    listing.originalListPrice !== listing.price
      ? ((listing.originalListPrice - listing.price) / listing.originalListPrice) * 100
      : null

  const composite =
    score?.composite ??
    (storedScore != null && Number.isFinite(Number(storedScore))
      ? Number(storedScore)
      : 0)

  return {
    key: listing.listingKey || listing.mlsId,
    listingKey: listing.listingKey ?? null,
    mlsId: listing.mlsId,
    score: composite,
    scoreBreakdown: score,
    address: listing.address.street || listing.address.full,
    city: listing.address.city?.trim() || null,
    town:
      dbTown?.trim() ||
      townForListing(listing) ||
      listing.address.city?.trim() ||
      null,
    zip: normalizeZip(listing.address.postalCode),
    type: shortType(listing.propertyType),
    price: listing.price,
    pricePerSqft,
    sqft: listing.sqft,
    lotAcres:
      coerceLotAcres(listing.lotAcres) ?? parseLotAcresFromRaw(listing.raw) ?? null,
    dom: daysOnMarket,
    status: deriveStatus(listing, priceReductionPercent, daysOnMarket),
    isRental: rental,
    beds: listing.beds,
    baths: listing.baths,
    yearBuilt: listing.yearBuilt,
    headline: listing.remarks?.trim().slice(0, 80) ?? '',
    photoCount: listing.photoCount ?? null,
    primaryPhotoIndex: null,
    modificationTimestamp,
    listDate: listing.listDate?.trim() || null,
    syncedAt,
  }
}

function mapStoredLatestRows(
  rows: Awaited<ReturnType<typeof readRecentlyUpdatedListings>>,
): LatestListingRow[] {
  const out: LatestListingRow[] = []
  for (const row of rows) {
    const stored = parseStoredBreakdown(row.goldilocksBreakdown)
    const mapped = toLatestRow(
      row.listing,
      stored,
      row.modificationTimestamp,
      row.syncedAt,
      row.town,
      row.goldilocksScore,
    )
    if (mapped) out.push(mapped)
  }
  return out
}

/** Background-only: score rows missing Goldilocks (never await on /api/listings/latest). */
async function scoreUnscoredLatestRows(
  rows: Awaited<ReturnType<typeof readRecentlyUpdatedListings>>,
): Promise<LatestListingRow[]> {
  const unscoredByTown = new Map<TmreTown, typeof rows>()
  const scoredRows: LatestListingRow[] = []

  for (const row of rows) {
    const stored = parseStoredBreakdown(row.goldilocksBreakdown)
    if (stored || row.goldilocksScore != null) {
      const mapped = toLatestRow(
        row.listing,
        stored,
        row.modificationTimestamp,
        row.syncedAt,
        row.town,
        row.goldilocksScore,
      )
      if (mapped) scoredRows.push(mapped)
      continue
    }

    const town =
      townForListing(row.listing) ??
      (isTmreTown(row.town) ? (row.town as TmreTown) : null)
    if (!town) {
      const mapped = toLatestRow(
        row.listing,
        null,
        row.modificationTimestamp,
        row.syncedAt,
        row.town,
      )
      if (mapped) scoredRows.push(mapped)
      continue
    }
    const bucket = unscoredByTown.get(town) ?? []
    bucket.push(row)
    unscoredByTown.set(town, bucket)
  }

  for (const [town, townRows] of unscoredByTown) {
    const listings = townRows.map((r) => r.listing)
    const { listings: peerPool } = await fetchActiveListingsForCity(town, 250)
    const boardScores = await scoreListingsWithBoardPeers(listings, peerPool)
    const scoreById = new Map(
      boardScores.map((s) => [s.listing.mlsId || s.listing.listingKey, s.score]),
    )
    const scoredAt = new Date().toISOString()
    const persistRows = boardScores
      .map((s) => {
        const id = listingRowId(s.listing)
        if (!id) return null
        return {
          id,
          score: s.score.composite,
          breakdownJson: JSON.stringify(s.score),
          scoredAt,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
    if (persistRows.length > 0) {
      try {
        await upsertListingScores(persistRows)
      } catch (err) {
        console.warn(
          `[latest-listings] score persist failed for ${town}`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    for (const row of townRows) {
      const id = row.listing.mlsId || row.listing.listingKey
      const mapped = toLatestRow(
        row.listing,
        scoreById.get(id) ?? null,
        row.modificationTimestamp,
        row.syncedAt,
        row.town,
      )
      if (mapped) scoredRows.push(mapped)
    }
  }

  return scoredRows
}

/** Latest must surface MLS activity from this window when it exists in Postgres. */
export const LATEST_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

function sortLatestByModification(rows: LatestListingRow[]): LatestListingRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.modificationTimestamp ?? '')
    const tb = Date.parse(b.modificationTimestamp ?? '')
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** True when at least one row has MLS mod or list-date inside the fresh window. */
export function feedHasUpdateWithinWindow(
  rows: readonly LatestListingRow[],
  windowMs = LATEST_FRESH_WINDOW_MS,
  nowMs = Date.now(),
): boolean {
  const cutoff = nowMs - windowMs
  for (const row of rows) {
    const mod = parseIsoMs(row.modificationTimestamp)
    if (mod != null && mod >= cutoff) return true
    const listed = parseIsoMs(row.listDate)
    if (listed != null && listed >= cutoff) return true
  }
  return false
}

function rowInFreshWindow(row: LatestListingRow, cutoffMs: number): boolean {
  const mod = parseIsoMs(row.modificationTimestamp)
  if (mod != null && mod >= cutoffMs) return true
  const listed = parseIsoMs(row.listDate)
  if (listed != null && listed >= cutoffMs) return true
  return false
}

/**
 * Prefer last-24h MLS mods + brand-new list dates, then fill with older updates
 * so the ticker stays full when the market is quiet.
 */
function rankLatestFreshFirst(
  rows: LatestListingRow[],
  cap: number,
  nowMs = Date.now(),
): LatestListingRow[] {
  const cutoff = nowMs - LATEST_FRESH_WINDOW_MS
  const fresh: LatestListingRow[] = []
  const older: LatestListingRow[] = []
  for (const row of sortLatestByModification(rows)) {
    if (rowInFreshWindow(row, cutoff)) fresh.push(row)
    else older.push(row)
  }
  return [...fresh, ...older].slice(0, cap)
}

function mergeRecentlyUpdatedRows(
  batches: RecentlyUpdatedRow[][],
): RecentlyUpdatedRow[] {
  const byKey = new Map<string, RecentlyUpdatedRow>()
  for (const batch of batches) {
    for (const row of batch) {
      const key = listingRowId(row.listing)
      if (!key || byKey.has(key)) continue
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
}

export async function fetchLatestUpdatedListings(options: {
  since?: string | null
  limit?: number
  town?: string | null
  /** Skip prebuilt town-feed cache (used while rebuilding that cache). */
  bypassTownFeedCache?: boolean
  /** Skip prebuilt global Latest ticker cache. */
  bypassGlobalFeedCache?: boolean
  /**
   * Live-score unscored rows (schools/peers). Only for background warm —
   * page requests must stay on SQLite-only stored scores.
   */
  allowLiveScore?: boolean
}): Promise<LatestListingRow[]> {
  const cap = options.limit ?? 30
  const town = options.town?.trim() || null
  const allowLiveScore = options.allowLiveScore === true
  const nowMs = Date.now()

  // Instant path for default /latest: last warm from the 30-minute DB refresh.
  // Reject cache that has no MLS activity in the last 24h so stale warm cannot
  // hide brand-new / freshly modified inventory sitting in Postgres.
  if (!town && !options.since && !options.bypassGlobalFeedCache) {
    const { readLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
    const cached = await readLatestGlobalFeedCache(cap)
    if (cached && feedHasUpdateWithinWindow(cached, LATEST_FRESH_WINDOW_MS, nowMs)) {
      return cached
    }
  }

  // Instant path for Latest town clicks: prebuilt during the background warm.
  if (town && !options.since && !options.bypassTownFeedCache) {
    const { readLatestTownFeedCache } = await import('@/lib/latest-town-feed-cache')
    const cached = await readLatestTownFeedCache(town, cap)
    if (cached && feedHasUpdateWithinWindow(cached, LATEST_FRESH_WINDOW_MS, nowMs)) {
      return cached
    }
  }

  const freshSinceIso = new Date(nowMs - LATEST_FRESH_WINDOW_MS).toISOString()
  const [byMod, byListDate] = await Promise.all([
    readRecentlyUpdatedListings({
      since: options.since,
      // Pull a wider mod slice so 24h ranking has room after merge.
      limit: Math.min(Math.max(cap * 3, cap), 120),
      statusBucket: 'Active',
      town,
    }),
    options.since
      ? Promise.resolve([] as RecentlyUpdatedRow[])
      : readRecentlyListedListings({
          since: freshSinceIso,
          limit: cap,
          statusBucket: 'Active',
          town,
        }),
  ])
  const rows = mergeRecentlyUpdatedRows([byListDate, byMod])
  if (rows.length === 0) return []

  // Prefer stored scores on the request path. If this slice is mostly
  // unscored (common for brand-new MLS updates), live-score the small
  // batch so /latest does not show 0.0 while the detail page has a score.
  let scoredRows: LatestListingRow[]
  if (allowLiveScore) {
    scoredRows = await scoreUnscoredLatestRows(rows)
  } else {
    const mapped = mapStoredLatestRows(rows)
    const unscoredCount = mapped.filter((r) => !(r.score > 0)).length
    const shouldLiveScore =
      mapped.length > 0 && unscoredCount / mapped.length >= 0.4 && mapped.length <= 40
    scoredRows = shouldLiveScore
      ? await scoreUnscoredLatestRows(rows)
      : mapped
  }

  const sorted = rankLatestFreshFirst(scoredRows, cap, nowMs)

  // Seed durable global ticker from this SQLite hit so the next load is instant.
  if (
    !town &&
    !options.since &&
    !options.bypassGlobalFeedCache &&
    !allowLiveScore &&
    sorted.length > 0
  ) {
    try {
      const { writeLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
      await writeLatestGlobalFeedCache(sorted)
    } catch {
      /* ignore — warm will rewrite later */
    }
  }

  return sorted
}

export type { TownUpdateStat }

export async function fetchTownUpdateStats(options: {
  since?: string | null
} = {}): Promise<TownUpdateStat[]> {
  try {
    return await readTownUpdateStats(options)
  } catch (err) {
    console.warn(
      '[latest-listings] fetchTownUpdateStats failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
