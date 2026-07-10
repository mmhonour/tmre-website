import 'server-only'

import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { attachIntelligenceBoardInsights } from '@/lib/intelligence-board-insights'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import {
  listingRowId,
  publishListingsReadSnapshot,
  readListingsFromDb,
  readListingScoresByIds,
  readStatsCacheRow,
  setSyncMeta,
  upsertListingScores,
  writeStatsCacheRow,
} from '@/lib/listings-db'
import { hasLocalListingsCache } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { statsCacheKey } from '@/lib/stats-compute'
import {
  isTmreTown,
  listingZipMatchesTown,
  normalizeZip,
  TMRE_TOWNS,
  type TmreTown,
} from '@/lib/tmre-towns'

export const INTELLIGENCE_DEAL_BOARD_CACHE_KEY = 'intelligence-deal-board:v2'
/** Per-town cap for the board payload. Keep at/above Active inventory depth. */
export const INTELLIGENCE_DEAL_BOARD_LIMIT = 2000

export type IntelligenceBoardListing = {
  key: string
  listingKey: string | null
  mlsId: string
  score: number
  scoreBreakdown: ScoreBreakdown | null
  address: string
  city: string | null
  type: string
  propertyType: string
  price: number
  pricePerSqft: number | null
  sqft: number | null
  lotAcres: number | null
  dom: number | null
  status: 'Active' | 'Pending' | 'New' | 'Reduced'
  isRental: boolean
  isCommercial: boolean
  yearBuilt: number | null
  beds: number | null
  baths: number | null
  zip: string | null
  photoCount: number | null
  primaryPhotoIndex: number | null
  headline: string
}

export type IntelligenceDealBoardTownMeta = {
  avgMonthlySalesSale: number
  avgMonthlySalesRental: number
  closedThisWeekSale: number
  closedThisWeekRental: number
  closedThisWeekByZipSale: Record<string, number>
  closedThisWeekByZipRental: Record<string, number>
}

export type IntelligenceDealBoardPayload = {
  version: 1
  generatedAt: string
  towns: Record<TmreTown, IntelligenceBoardListing[]>
  meta: Record<TmreTown, IntelligenceDealBoardTownMeta>
}

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType)
}

function isCommercialType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType)
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
): IntelligenceBoardListing['status'] {
  const status = listing.status?.toLowerCase() ?? ''
  if (status === 'pending') return 'Pending'
  if (status === 'coming soon' || status === 'cs') return 'New'
  if ((priceReductionPercent ?? 0) > 1) return 'Reduced'
  if ((daysOnMarket ?? 99) <= 7) return 'New'
  return 'Active'
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

function avgMonthlySalesFromPayload(
  data: { year: number; month: number; count: number }[] | undefined,
): number {
  if (!data?.length) return 0
  const now = new Date()
  const recent: number[] = []
  for (let offset = 1; offset <= 3; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const yr = date.getFullYear()
    const mo = date.getMonth() + 1
    const entry = data.find((e) => e.year === yr && e.month === mo)
    if (entry) recent.push(entry.count)
  }
  if (!recent.length) return 0
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

function readTownSalesMeta(town: TmreTown): IntelligenceDealBoardTownMeta {
  const empty: IntelligenceDealBoardTownMeta = {
    avgMonthlySalesSale: 0,
    avgMonthlySalesRental: 0,
    closedThisWeekSale: 0,
    closedThisWeekRental: 0,
    closedThisWeekByZipSale: {},
    closedThisWeekByZipRental: {},
  }
  for (const kind of ['sale', 'rental'] as const) {
    const row = readStatsCacheRow(statsCacheKey('sales-by-month', town, kind))
    if (!row?.payload) continue
    try {
      const payload = JSON.parse(row.payload) as {
        data?: { year: number; month: number; count: number }[]
        closedThisWeek?: number
        closedThisWeekByZip?: Record<string, number>
      }
      const avg = avgMonthlySalesFromPayload(payload.data)
      if (kind === 'sale') {
        empty.avgMonthlySalesSale = avg
        empty.closedThisWeekSale = payload.closedThisWeek ?? 0
        empty.closedThisWeekByZipSale = payload.closedThisWeekByZip ?? {}
      } else {
        empty.avgMonthlySalesRental = avg
        empty.closedThisWeekRental = payload.closedThisWeek ?? 0
        empty.closedThisWeekByZipRental = payload.closedThisWeekByZip ?? {}
      }
    } catch {
      /* ignore bad cache row */
    }
  }
  return empty
}

function toBoardListing(
  listing: Listing,
  score: ScoreBreakdown | null,
  storedScore: number | null,
  town: TmreTown,
): IntelligenceBoardListing | null {
  if (listing.price == null || listing.price <= 0) return null
  const rental = isRentalType(listing.propertyType)
  const commercial = isCommercialType(listing.propertyType)
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
  const zip = normalizeZip(listing.address.postalCode)
  if (!listingZipMatchesTown(zip, town)) return null

  return {
    key: listing.listingKey || listing.mlsId,
    listingKey: listing.listingKey ?? null,
    mlsId: listing.mlsId,
    score: score?.composite ?? storedScore ?? 0,
    scoreBreakdown: score,
    address: listing.address.street || listing.address.full,
    city: town,
    type: shortType(listing.propertyType),
    propertyType: listing.propertyType,
    price: listing.price,
    pricePerSqft,
    sqft: listing.sqft,
    lotAcres: listing.lotAcres ?? null,
    dom: daysOnMarket,
    status: deriveStatus(listing, priceReductionPercent, daysOnMarket),
    isRental: rental,
    isCommercial: commercial,
    yearBuilt: listing.yearBuilt,
    beds: listing.beds,
    baths: listing.baths,
    zip,
    photoCount: listing.photoCount ?? null,
    primaryPhotoIndex: null,
    headline: '',
  }
}

async function buildTownBoard(
  town: TmreTown,
  limit: number,
): Promise<IntelligenceBoardListing[]> {
  const peerPool = readListingsFromDb(town, 'Active')
  // Prefer the full Active pool when under the cap; otherwise take first `limit`
  // (DB order is price DESC). Scoring still uses the full peerPool.
  const listings = peerPool.length <= limit ? peerPool : peerPool.slice(0, limit)
  const ids = listings.map((l) => listingRowId(l)).filter(Boolean)
  const storedScores = readListingScoresByIds(ids)

  const unscored: Listing[] = []
  const scoreById = new Map<string, ScoreBreakdown>()
  const compositeById = new Map<string, number>()

  for (const listing of listings) {
    const id = listingRowId(listing)
    if (!id) continue
    const stored = storedScores.get(id)
    const breakdown = parseStoredBreakdown(stored?.breakdownJson)
    if (breakdown) {
      scoreById.set(id, breakdown)
      compositeById.set(id, breakdown.composite)
    } else if (stored?.score != null) {
      compositeById.set(id, stored.score)
    } else {
      unscored.push(listing)
    }
  }

  if (unscored.length > 0) {
    const boardScores = await scoreListingsWithBoardPeers(unscored, peerPool)
    const scoredAt = new Date().toISOString()
    const persist = boardScores
      .map((row) => {
        const id = listingRowId(row.listing)
        if (!id) return null
        scoreById.set(id, row.score)
        compositeById.set(id, row.score.composite)
        return {
          id,
          score: row.score.composite,
          breakdownJson: JSON.stringify(row.score),
          scoredAt,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
    if (persist.length > 0) {
      try {
        upsertListingScores(persist)
      } catch (err) {
        console.warn(
          `[intelligence-deal-board] score persist failed for ${town}`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  const rows: IntelligenceBoardListing[] = []
  for (const listing of listings) {
    const id = listingRowId(listing)
    const mapped = toBoardListing(
      listing,
      scoreById.get(id) ?? null,
      compositeById.get(id) ?? null,
      town,
    )
    if (mapped) rows.push(mapped)
  }
  rows.sort((a, b) => b.score - a.score)
  return attachIntelligenceBoardInsights(rows)
}

export function readIntelligenceDealBoardCache(): IntelligenceDealBoardPayload | null {
  if (!hasLocalListingsCache()) return null
  const row = readStatsCacheRow(INTELLIGENCE_DEAL_BOARD_CACHE_KEY)
  if (!row?.payload) return null
  try {
    const parsed = JSON.parse(row.payload) as IntelligenceDealBoardPayload
    if (parsed?.version !== 1 || !parsed.towns) return null
    return parsed
  } catch {
    return null
  }
}

/** Rebuild slim Intelligence board + sales meta for every TMRE town. */
export async function rebuildIntelligenceDealBoardCache(
  options: { limit?: number } = {},
): Promise<{ towns: number; listings: number; durationMs: number }> {
  const limit = options.limit ?? INTELLIGENCE_DEAL_BOARD_LIMIT
  const t0 = Date.now()
  const towns = {} as Record<TmreTown, IntelligenceBoardListing[]>
  const meta = {} as Record<TmreTown, IntelligenceDealBoardTownMeta>
  let listingCount = 0

  for (const town of TMRE_TOWNS) {
    if (!isTmreTown(town)) continue
    const rows = await buildTownBoard(town, limit)
    towns[town] = rows
    meta[town] = readTownSalesMeta(town)
    listingCount += rows.length
  }

  const generatedAt = new Date().toISOString()
  const payload: IntelligenceDealBoardPayload = {
    version: 1,
    generatedAt,
    towns,
    meta,
  }
  writeStatsCacheRow(INTELLIGENCE_DEAL_BOARD_CACHE_KEY, payload)
  setSyncMeta('last_intelligence_deal_board', generatedAt)
  publishListingsReadSnapshot()

  const durationMs = Date.now() - t0
  console.info(
    `[intelligence-deal-board] warmed ${TMRE_TOWNS.length} towns / ${listingCount} listings in ${durationMs}ms`,
  )
  return { towns: TMRE_TOWNS.length, listings: listingCount, durationMs }
}

let boardWarmRunning = false

export function warmIntelligenceDealBoardDeferred(): void {
  if (boardWarmRunning) return
  boardWarmRunning = true
  void (async () => {
    try {
      await new Promise((r) => setTimeout(r, 2_000))
      await rebuildIntelligenceDealBoardCache()
    } catch (err) {
      console.error('[intelligence-deal-board] deferred warm failed', err)
    } finally {
      boardWarmRunning = false
    }
  })()
}
