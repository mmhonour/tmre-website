import 'server-only'

import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import {
  firstStoredListingPhotoIndex,
  listingRowId,
  readRecentlyUpdatedListings,
  readTownUpdateStats,
  upsertListingScores,
  type TownUpdateStat,
} from '@/lib/listings-db'
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

  return {
    key: listing.listingKey || listing.mlsId,
    listingKey: listing.listingKey ?? null,
    mlsId: listing.mlsId,
    score: score?.composite ?? storedScore ?? 0,
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
    primaryPhotoIndex: firstStoredListingPhotoIndex(
      listing.listingKey?.trim() || listing.mlsId,
    ),
    modificationTimestamp,
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
        upsertListingScores(persistRows)
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

  // Instant path for default /latest: last warm from the 30-minute DB refresh.
  if (!town && !options.since && !options.bypassGlobalFeedCache) {
    const { readLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
    const cached = readLatestGlobalFeedCache(cap)
    if (cached) return cached
  }

  // Instant path for Latest town clicks: prebuilt during the background warm.
  if (town && !options.since && !options.bypassTownFeedCache) {
    const { readLatestTownFeedCache } = await import('@/lib/latest-town-feed-cache')
    const cached = readLatestTownFeedCache(town, cap)
    if (cached) return cached
  }

  const rows = readRecentlyUpdatedListings({
    since: options.since,
    limit: cap,
    statusBucket: 'Active',
    town,
  })
  if (rows.length === 0) return []

  // Page requests: never stall on live scoring. Background warm may live-score.
  const scoredRows = allowLiveScore
    ? await scoreUnscoredLatestRows(rows)
    : mapStoredLatestRows(rows)

  const sorted = sortLatestByModification(scoredRows).slice(0, cap)

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
      writeLatestGlobalFeedCache(sorted)
    } catch {
      /* ignore — warm will rewrite later */
    }
  }

  return sorted
}

export type { TownUpdateStat }

export function fetchTownUpdateStats(options: {
  since?: string | null
} = {}): TownUpdateStat[] {
  try {
    return readTownUpdateStats(options)
  } catch (err) {
    console.warn(
      '[latest-listings] fetchTownUpdateStats failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
