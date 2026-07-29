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
import {
  UNDER_CONTRACT_CTS_MLS_STATUS,
  UNDER_CONTRACT_MLS_STATUS,
  fetchActiveListingsForCity,
} from '@/lib/listings-store'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import type { Listing } from '@/lib/rets'
import {
  isTmreTown,
  listingInTmreCoverage,
  normalizeZip,
  resolveListingTown,
  type TmreTown,
} from '@/lib/tmre-towns'
import { coerceLotAcres, parseLotAcresFromRaw } from '@/lib/listing-lot-acres'
import { latestActivityMs } from '@/lib/latest-activity'
import { mlsTimestampMs } from '@/lib/mls-time'
import {
  LATEST_FRESH_WINDOW_MS,
  ensureMinOneListingPerTmreTown,
  feedCoversAllTmreTowns,
  missingTmreTowns,
  rankLatestFeedRows,
} from '@/lib/latest-town-coverage'

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
  status: 'Active' | 'Pending' | 'New' | 'Reduced' | 'Coming Soon' | 'Back on Market'
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

const DAY_MS = 86_400_000
/** Genuinely new inventory: DOM inside this window, or listed inside it. */
const NEW_LISTING_MAX_DOM = 7
/**
 * How long a recorded Under Contract → Active (or off-market → Active) flip is
 * still news. Applies to the exact `previous_mls_status` signal.
 */
const BACK_ON_MARKET_WINDOW_MS = 14 * DAY_MS
/**
 * Fallback window for rows with no recorded previous status (pre-0010 rows and
 * anything built straight from a RETS Listing): only a very recent MLS status
 * change counts, since we cannot see what it changed from.
 */
const BACK_ON_MARKET_HEURISTIC_WINDOW_MS = 3 * DAY_MS
/** Past this DOM a re-activated listing is clearly not new inventory. */
const BACK_ON_MARKET_MIN_DOM = 14

function isActiveMlsStatus(status: string): boolean {
  return status === 'active' || status === 'a'
}

/** Statuses a listing can come back to market *from*. */
function isBackOnMarketSourceStatus(status: string | null): boolean {
  const s = status?.trim().toLowerCase() ?? ''
  if (!s) return false
  if (
    s === UNDER_CONTRACT_MLS_STATUS.toLowerCase() ||
    s === UNDER_CONTRACT_CTS_MLS_STATUS.toLowerCase() ||
    s.includes('under contract')
  ) {
    return true
  }
  return s.includes('withdrawn') || s.includes('off market') || s.includes('off-market')
}

function isNewInventory(
  daysOnMarket: number | null,
  listDate: string | null,
  nowMs: number,
): boolean {
  if ((daysOnMarket ?? 99) <= NEW_LISTING_MAX_DOM) return true
  const listedMs = mlsTimestampMs(listDate)
  if (Number.isNaN(listedMs)) return false
  return nowMs - listedMs <= NEW_LISTING_MAX_DOM * DAY_MS
}

/**
 * Available again but not new. Prefers the recorded previous status; falls back
 * to a recent status change on an older listing when that is unknown.
 */
function isBackOnMarket(
  currentStatus: string,
  previousMlsStatus: string | null,
  statusChangedAt: string | null,
  daysOnMarket: number | null,
  nowMs: number,
): boolean {
  if (!isActiveMlsStatus(currentStatus)) return false
  const changedMs = mlsTimestampMs(statusChangedAt)
  const sinceChangeMs = Number.isNaN(changedMs) ? null : nowMs - changedMs

  if (previousMlsStatus) {
    if (!isBackOnMarketSourceStatus(previousMlsStatus)) return false
    return sinceChangeMs == null || sinceChangeMs <= BACK_ON_MARKET_WINDOW_MS
  }

  if (sinceChangeMs == null || sinceChangeMs > BACK_ON_MARKET_HEURISTIC_WINDOW_MS) {
    return false
  }
  return (daysOnMarket ?? 0) >= BACK_ON_MARKET_MIN_DOM
}

function deriveStatus(
  listing: Listing,
  priceReductionPercent: number | null,
  daysOnMarket: number | null,
  previousMlsStatus: string | null,
  previousStatusChangedAt: string | null,
  nowMs: number = Date.now(),
): LatestListingRow['status'] {
  const status = listing.status?.trim().toLowerCase() ?? ''
  if (status === 'pending') return 'Pending'
  if (status === 'coming soon' || status === 'cs') return 'Coming Soon'
  if (isNewInventory(daysOnMarket, listing.listDate ?? null, nowMs)) return 'New'
  if (
    isBackOnMarket(
      status,
      previousMlsStatus,
      previousStatusChangedAt ?? listing.statusChangeTimestamp ?? null,
      daysOnMarket,
      nowMs,
    )
  ) {
    return 'Back on Market'
  }
  if ((priceReductionPercent ?? 0) > 1) return 'Reduced'
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
  /** Null for rows built straight from a RETS Listing (no stored history). */
  previousMlsStatus: string | null = null,
  previousStatusChangedAt: string | null = null,
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

  const zip = normalizeZip(listing.address.postalCode)
  const town =
    (isTmreTown(dbTown) ? dbTown.trim() : null) ||
    townForListing(listing)
  // Latest is TMRE-only — drop out-of-market rows (Stamford / Putnam / …).
  if (!town || !isTmreTown(town)) return null
  if (!listingInTmreCoverage(zip, town)) return null

  return {
    key: listing.listingKey || listing.mlsId,
    listingKey: listing.listingKey ?? null,
    mlsId: listing.mlsId,
    score: composite,
    scoreBreakdown: score,
    address: listing.address.street || listing.address.full,
    city: listing.address.city?.trim() || null,
    town,
    zip,
    type: shortType(listing.propertyType),
    price: listing.price,
    pricePerSqft,
    sqft: listing.sqft,
    lotAcres:
      coerceLotAcres(listing.lotAcres) ?? parseLotAcresFromRaw(listing.raw) ?? null,
    dom: daysOnMarket,
    status: deriveStatus(
      listing,
      priceReductionPercent,
      daysOnMarket,
      previousMlsStatus,
      previousStatusChangedAt,
    ),
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
      row.previousMlsStatus,
      row.previousStatusChangedAt,
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
        row.previousMlsStatus,
        row.previousStatusChangedAt,
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
        null,
        row.previousMlsStatus,
        row.previousStatusChangedAt,
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
        null,
        row.previousMlsStatus,
        row.previousStatusChangedAt,
      )
      if (mapped) scoredRows.push(mapped)
    }
  }

  return scoredRows
}

export { LATEST_FRESH_WINDOW_MS }

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

/** True when every row is one of the 7 TMRE towns (rejects polluted warm cache). */
export function feedIsTmreOnly(rows: readonly LatestListingRow[]): boolean {
  if (rows.length === 0) return false
  for (const row of rows) {
    if (!isTmreTown(row.town) && !isTmreTown(row.city)) return false
  }
  return true
}

/**
 * Prefer last-24h MLS mods + brand-new list dates — real events (Coming Soon /
 * New / Back on Market / Reduced) ahead of plain rows inside each of those
 * groups — then fill with older updates so the ticker stays full when quiet.
 */
function rankLatestFreshFirst(
  rows: LatestListingRow[],
  cap: number,
  nowMs = Date.now(),
): LatestListingRow[] {
  return rankLatestFeedRows(rows, nowMs).slice(0, cap)
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
  // Also reject feeds that omit any TMRE town (quiet towns must still show 1).
  if (!town && !options.since && !options.bypassGlobalFeedCache) {
    const { readLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
    const cached = await readLatestGlobalFeedCache(cap)
    if (
      cached &&
      feedIsTmreOnly(cached) &&
      feedCoversAllTmreTowns(cached) &&
      feedHasUpdateWithinWindow(cached, LATEST_FRESH_WINDOW_MS, nowMs)
    ) {
      return cached
    }
  }

  // Instant path for Latest town clicks: prebuilt during the background warm.
  if (town && !options.since && !options.bypassTownFeedCache) {
    if (!isTmreTown(town)) return []
    const { readLatestTownFeedCache } = await import('@/lib/latest-town-feed-cache')
    const cached = await readLatestTownFeedCache(town, cap)
    if (
      cached &&
      feedIsTmreOnly(cached) &&
      feedHasUpdateWithinWindow(cached, LATEST_FRESH_WINDOW_MS, nowMs)
    ) {
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

  // Town-scoped feeds stay newest-first. Global ticker also guarantees every
  // TMRE town appears at least once (its latest update), then fills to `cap`.
  let sorted = town
    ? rankLatestFreshFirst(scoredRows, cap, nowMs)
    : ensureMinOneListingPerTmreTown(
        rankLatestFreshFirst(scoredRows, Math.max(cap * 4, 80), nowMs),
        cap,
      )

  if (!town) {
    const missing = missingTmreTowns(sorted)
    if (missing.length > 0) {
      const fillerBatches = await Promise.all(
        missing.map((missingTown) =>
          readRecentlyUpdatedListings({
            limit: 1,
            statusBucket: 'Active',
            town: missingTown,
          }),
        ),
      )
      const fillerRows = mergeRecentlyUpdatedRows(fillerBatches)
      if (fillerRows.length > 0) {
        const fillerMapped = allowLiveScore
          ? await scoreUnscoredLatestRows(fillerRows)
          : mapStoredLatestRows(fillerRows)
        sorted = ensureMinOneListingPerTmreTown(sorted, cap, fillerMapped)
      }
    }
  }

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
