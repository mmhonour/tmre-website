import 'server-only'

import type { Listing } from './rets'
import { isMarketListing } from './listings-store'
import { parseLotAcres } from './fixer-listings'
import {
  buildInsight,
  kindOf,
  type ScoredListing,
} from './goldilocks'
import { scoreListingsWithBoardPeers } from './board-scoring'
import { filterListingsToTmreTowns } from './tmre-towns'
import { listingMatchesPropertyClass } from './listing-property-class'
import { isNewConstructionListing } from './new-construction-server'
import {
  computeListingPeerStats,
  deriveDealSuperlatives,
  normalizeStyleKey,
} from './deal-superlatives'
import { listingPhotoProxyUrl } from './listing-url'
import { listingRowId } from '@/lib/db/listings-repo'
import { readListingSuperlativesByMlsIds } from './db/listings-repo'
import { normalizeZip } from './tmre-towns'

export type DealPickPayload = {
  generatedAt: string
  totalReviewed: number
  qualifiedCount: number
  rejectedCount: number
  salesReviewed: number
  rentalsReviewed: number
  kind: 'sale' | 'rental'
  pickMode: 'below-median' | 'board-top'
  insight: string
  superlatives: string[]
  score: ScoredListing['score']
  pricePerSqft: number | null
  cityMedianPricePerSqft: number | null
  cityMedianPrice: number | null
  valueDiscountPct: number | null
  lotAcres: number | null
  photoUrl: string | null
  listing: Listing
  runnerUps: { mlsId: string; address: string; composite: number; kind: 'sale' | 'rental' }[]
}

/**
 * Local photo proxy — avoids a RETS round-trip before the homepage hero can paint.
 * Defaults to index 0 (no per-render DB lookup); the deal-hero warmer overrides
 * this with the first stored index when a leading RETS slot is empty.
 */
export function dealListingPhotoUrl(listing: {
  mlsId: string
  listingKey?: string | null
  photoCount?: number | null
}): string | null {
  const id = listing.listingKey?.trim() || listing.mlsId.trim()
  if (!id) return null
  if (listing.photoCount != null && listing.photoCount <= 0) return null
  return listingPhotoProxyUrl(id, 0)
}

const RENDERING_KEYWORDS = [
  'rendering',
  'architectural render',
  'artist rendering',
  "artist's rendering",
  'photorealistic render',
  'proposed dwelling',
  'to be built',
  'pre-construction',
  'pre construction',
  'under construction',
  'build to suit',
  'conceptual design',
  'architectural plans',
]

function collectRemarks(l: Listing): string {
  return [l.raw.PublicRemarks, l.raw.RemarksPublicAddendum, l.raw.RoomsAdditional, l.raw.PropertyInfo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function listingHaystack(l: Listing): string {
  return `${l.propertyType} ${l.style} ${collectRemarks(l)}`.toLowerCase()
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function cityKey(l: Listing): string {
  return `${(l.address.city || 'unknown').toLowerCase()}::${kindOf(l)}`
}

function cityMedianListPrices(listings: Listing[]): Map<string, number> {
  const groups = new Map<string, number[]>()
  for (const l of listings) {
    if (!l.price || l.price <= 0) continue
    const key = cityKey(l)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l.price)
  }
  const out = new Map<string, number>()
  for (const [key, prices] of groups) {
    const m = median(prices)
    if (m != null) out.set(key, m)
  }
  return out
}

export { isNewConstructionListing } from './new-construction-server'

export function isRenderingOrProposedListing(l: Listing): boolean {
  const hay = listingHaystack(l)
  return RENDERING_KEYWORDS.some((k) => hay.includes(k))
}

function isBelowTownMedian(l: Listing, medians: Map<string, number>): boolean {
  if (!l.price || l.price <= 0) return false
  const med = medians.get(cityKey(l))
  if (med == null || med <= 0) return false
  return l.price < med
}

function valueDiscountPct(l: Listing, medians: Map<string, number>): number | null {
  if (!l.price) return null
  const med = medians.get(cityKey(l))
  if (!med || med <= 0) return null
  return Math.round((1 - l.price / med) * 100)
}

function valueDealRank(s: ScoredListing, medians: Map<string, number>): number {
  const discount = valueDiscountPct(s.listing, medians) ?? 0
  const ppsfBonus = s.score.pricePerSqftFit >= 75 ? 8 : s.score.pricePerSqftFit >= 65 ? 4 : 0
  return s.score.composite * 0.65 + Math.min(discount, 30) * 0.35 + ppsfBonus
}

function selectPeerBucketForListing(
  listing: Listing,
  pool: readonly Listing[],
): Listing[] {
  const selfId = listingRowId(listing)
  const zip = normalizeZip(listing.address.postalCode)
  let peers: Listing[] = []

  if (zip) {
    peers = pool.filter((row) => {
      const id = listingRowId(row)
      if (!id || id === selfId) return false
      return normalizeZip(row.address.postalCode) === zip
    })
  }

  if (peers.length < 5) {
    peers = pool.filter((row) => {
      const id = listingRowId(row)
      return Boolean(id && id !== selfId)
    })
  }

  return peers
}

async function resolveWinnerSuperlatives(
  winner: ScoredListing,
  listings: Listing[],
  medians: Map<string, number>,
  pickMode: DealPickPayload['pickMode'],
  lotAcres: number | null,
  valueDiscount: number | null,
): Promise<string[]> {
  const cached = (await readListingSuperlativesByMlsIds([winner.listing.mlsId])).get(
    winner.listing.mlsId,
  )
  if (cached?.length) return cached

  const activePeers = listings.filter(isMarketListing)
  const peers = selectPeerBucketForListing(winner.listing, activePeers)
  const peerRows = peers.map((peer) => ({
    sqft: peer.sqft,
    lotAcres: parseLotAcres(peer),
    yearBuilt: peer.yearBuilt,
    dom: peer.dom,
    price: peer.price,
    styleKey: normalizeStyleKey(peer.style),
    score: null,
  }))
  const peerStats = computeListingPeerStats(
    {
      sqft: winner.listing.sqft,
      lotAcres,
      yearBuilt: winner.listing.yearBuilt,
      dom: winner.listing.dom,
      price: winner.listing.price,
      styleKey: normalizeStyleKey(winner.listing.style),
      score: {
        condition: winner.score.condition,
        layoutQuality: winner.score.layoutQuality,
        age: winner.score.age,
        finishesQuality: winner.score.finishesQuality,
        composite: winner.score.composite,
      },
    },
    peerRows,
  )

  return deriveDealSuperlatives({
    score: winner.score,
    listing: winner.listing,
    valueDiscountPct: valueDiscount,
    pickMode,
    lotAcres,
    peerStats,
    styleKey: normalizeStyleKey(winner.listing.style),
    yearBuilt: winner.listing.yearBuilt,
    sqft: winner.listing.sqft,
  })
}

function buildValueDealInsight(s: ScoredListing, medians: Map<string, number>): string {
  const discount = valueDiscountPct(s.listing, medians)
  const city = s.listing.address.city || 'the area'
  const med = medians.get(cityKey(s.listing))
  const priceLabel = s.kind === 'rental' ? 'monthly rent' : 'list price'

  let lead = ''
  if (discount != null && discount > 0 && med != null) {
    const medFmt =
      s.kind === 'rental'
        ? `$${Math.round(med).toLocaleString()}/mo`
        : `$${Math.round(med).toLocaleString()}`
    lead = `Today's pick lists ${discount}% below the ${city} median ${priceLabel} (${medFmt}) — real value in established inventory, not new construction. `
  } else {
    lead = `Today's pick reflects below-median value in ${city} — established inventory, not new construction. `
  }

  return lead + buildInsight(s)
}

async function finalizePayload(
  listings: Listing[],
  scored: ScoredListing[],
  rejectedCount: number,
  medians: Map<string, number>,
  winner: ScoredListing,
  insight: string,
  pickMode: DealPickPayload['pickMode'],
): Promise<DealPickPayload> {
  const sorted = [...scored].sort((a, b) => {
    if (pickMode === 'below-median') {
      return valueDealRank(b, medians) - valueDealRank(a, medians)
    }
    return b.score.composite - a.score.composite
  })

  const payloadBase = {
    generatedAt: new Date().toISOString(),
    totalReviewed: listings.length,
    qualifiedCount: scored.length,
    rejectedCount,
    salesReviewed: listings.filter((l) => kindOf(l) === 'sale').length,
    rentalsReviewed: listings.filter((l) => kindOf(l) === 'rental').length,
    kind: winner.kind,
    pickMode,
    insight,
    score: winner.score,
    pricePerSqft: winner.pricePerSqft,
    cityMedianPricePerSqft: winner.cityMedianPpsf,
    cityMedianPrice: medians.get(cityKey(winner.listing)) ?? null,
    valueDiscountPct: valueDiscountPct(winner.listing, medians),
    lotAcres: parseLotAcres(winner.listing),
    photoUrl: dealListingPhotoUrl(winner.listing),
    listing: winner.listing,
    runnerUps: sorted.slice(1, 4).map((s) => ({
      mlsId: s.listing.mlsId,
      address: s.listing.address.full,
      composite: s.score.composite,
      kind: s.kind,
    })),
  }

  const superlatives = await resolveWinnerSuperlatives(
    winner,
    listings,
    medians,
    pickMode,
    payloadBase.lotAcres,
    payloadBase.valueDiscountPct,
  )

  return {
    ...payloadBase,
    superlatives,
  }
}

/** Same 0–100 composite path as Intelligence `/api/listings` (Deal Table). */
export async function scoreActiveListingsForBoard(
  active: Listing[],
  peerListings: Listing[],
): Promise<ScoredListing[]> {
  return scoreListingsWithBoardPeers(active, peerListings)
}

/** Deal of the Week — highest Goldilocks composite across the pool. */
export async function computeTopDeal(
  listings: Listing[],
  opts?: { peerListings?: Listing[] },
): Promise<DealPickPayload | null> {
  const medians = cityMedianListPrices(listings)
  const active = listings.filter(isMarketListing)
  const peers = opts?.peerListings ?? active
  const ranked = await scoreActiveListingsForBoard(active, peers)
  const winner = ranked[0]
  if (!winner) return null

  return finalizePayload(
    listings,
    ranked,
    0,
    medians,
    winner,
    buildInsight(winner),
    'board-top',
  )
}

function matchesListingId(l: Listing, listingId: string): boolean {
  const needle = listingId.trim().toLowerCase()
  if (!needle) return false
  if (l.mlsId?.trim().toLowerCase() === needle) return true
  if (l.listingKey?.trim().toLowerCase() === needle) return true
  return false
}

/**
 * Pick Deal of the Day from pre-scored board results (no RETS/scoring pass).
 * Used by the 5am cache rebuild to derive sale/rental/all from one score per town.
 */
export async function pickDealOfTheDayFromBoardScored(
  scoped: Listing[],
  boardScored: ScoredListing[],
  opts?: { listingId?: string },
): Promise<DealPickPayload | null> {
  if (!scoped.length) return null

  const medians = cityMedianListPrices(scoped)
  const active = scoped.filter(isMarketListing)
  if (!active.length) return null

  const activeIds = new Set(active.map((l) => l.mlsId))
  const scored = boardScored.filter((s) => activeIds.has(s.listing.mlsId))
  if (!scored.length) return null

  if (opts?.listingId?.trim()) {
    const pinned = scored.find((s) => matchesListingId(s.listing, opts.listingId!))
    if (!pinned) return null

    const belowMedian =
      !isNewConstructionListing(pinned.listing) &&
      !isRenderingOrProposedListing(pinned.listing) &&
      isBelowTownMedian(pinned.listing, medians)

    if (belowMedian) {
      return finalizePayload(
        scoped,
        scored.filter((s) =>
          active.some(
            (l) =>
              l.mlsId === s.listing.mlsId &&
              !isNewConstructionListing(l) &&
              !isRenderingOrProposedListing(l) &&
              isBelowTownMedian(l, medians),
          ),
        ),
        0,
        medians,
        pinned,
        buildValueDealInsight(pinned, medians),
        'below-median',
      )
    }

    return finalizePayload(
      scoped,
      scored,
      0,
      medians,
      pinned,
      buildInsight(pinned),
      'board-top',
    )
  }

  const valuePool = active.filter(
    (l) =>
      !isNewConstructionListing(l) &&
      !isRenderingOrProposedListing(l) &&
      isBelowTownMedian(l, medians),
  )

  if (valuePool.length) {
    const valueIds = new Set(valuePool.map((l) => l.mlsId))
    const candidates = scored.filter((s) => valueIds.has(s.listing.mlsId))
    if (candidates.length) {
      const sorted = [...candidates].sort(
        (a, b) => valueDealRank(b, medians) - valueDealRank(a, medians),
      )
      const winner = sorted[0]

      return finalizePayload(
        scoped,
        candidates,
        0,
        medians,
        winner,
        buildValueDealInsight(winner, medians),
        'below-median',
      )
    }
  }

  return finalizePayload(
    scoped,
    scored,
    0,
    medians,
    scored[0],
    buildInsight(scored[0]),
    'board-top',
  )
}

/**
 * Deal of the Day — below town median when available; otherwise the top
 * Goldilocks score from the Deal Table (same 0–100 composite as Intelligence).
 */
export async function computeDealOfTheDay(
  listings: Listing[],
  opts?: {
    kind?: 'sale' | 'rental'
    propertyClass?: 'homes' | 'multi' | 'condos'
    peerListings?: Listing[]
    listingId?: string
  },
): Promise<DealPickPayload | null> {
  let scoped = filterListingsToTmreTowns(listings)
  if (opts?.kind) {
    scoped = scoped.filter((l) => kindOf(l) === opts.kind)
  }
  if (opts?.propertyClass) {
    scoped = scoped.filter((l) =>
      listingMatchesPropertyClass(l.propertyType ?? '', opts.propertyClass!),
    )
  }
  if (!scoped.length) return null

  const active = scoped.filter(isMarketListing)
  if (!active.length) return null

  const peers = opts?.peerListings ?? active
  const boardScored = await scoreActiveListingsForBoard(active, peers)

  return pickDealOfTheDayFromBoardScored(scoped, boardScored, {
    ...(opts?.listingId ? { listingId: opts.listingId } : {}),
  })
}
