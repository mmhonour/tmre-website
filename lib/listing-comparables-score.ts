import 'server-only'

import { fetchBoardPeerPool, scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import {
  buildComparableListing,
  type ComparablesResult,
} from '@/lib/listing-comparables'
import type { ComparableListing } from '@/lib/listing-comparables-shared'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { resolveListingTownKey } from '@/lib/tmre-towns'

function listingIdentity(l: Listing): string {
  return l.listingKey?.trim() || l.mlsId?.trim() || ''
}

/** Use sold/leased price when scoring closed comps so PPSF reflects the transaction. */
function listingForScoring(l: Listing): Listing {
  if (!isClosedListing(l)) return l
  const salePrice = closedSalePrice(l)
  if (salePrice == null) return l
  return { ...l, price: salePrice }
}

function indexListings(pool: Listing[]): Map<string, Listing> {
  const byId = new Map<string, Listing>()
  for (const l of pool) {
    const id = listingIdentity(l)
    if (id) byId.set(id, l)
  }
  return byId
}

function resolveComparableListing(
  comp: ComparableListing,
  byId: Map<string, Listing>,
): Listing | null {
  const key = comp.listingKey?.trim() || comp.mlsId?.trim()
  if (!key) return null
  return byId.get(key) ?? byId.get(comp.mlsId) ?? null
}

function attachScores(
  comps: ComparableListing[],
  scoreById: Map<string, number>,
): ComparableListing[] {
  return comps.map((comp) => {
    const key = comp.listingKey?.trim() || comp.mlsId?.trim()
    const score = key ? (scoreById.get(key) ?? scoreById.get(comp.mlsId) ?? null) : null
    return {
      ...comp,
      goldilocksScore: score != null && score > 0 ? score : null,
    }
  })
}

/**
 * Score each comparable with the same board peer pool + Goldilocks model as
 * Intelligence `/api/listings`. Closed comps are scored at request time using
 * their close/lease price for PPSF fit.
 */
export async function enrichComparablesWithScores(
  subject: Listing,
  result: ComparablesResult,
  soldPool: Listing[],
  activePool: Listing[],
): Promise<ComparablesResult> {
  if (result.sold.length === 0 && result.active.length === 0) {
    return result
  }

  const town = resolveListingTownKey(
    subject.address.postalCode,
    subject.address.city,
  )
  if (!town) {
    return {
      ...result,
      sold: result.sold.map((c) => ({ ...c, goldilocksScore: null })),
      active: result.active.map((c) => ({ ...c, goldilocksScore: null })),
    }
  }

  const byId = indexListings([...soldPool, ...activePool])
  const targets: Listing[] = []

  for (const comp of [...result.sold, ...result.active]) {
    const listing = resolveComparableListing(comp, byId)
    if (listing) targets.push(listingForScoring(listing))
  }

  if (targets.length === 0) {
    return {
      ...result,
      sold: result.sold.map((c) => ({ ...c, goldilocksScore: null })),
      active: result.active.map((c) => ({ ...c, goldilocksScore: null })),
    }
  }

  try {
    const peerPool = await fetchBoardPeerPool(town)
    const scored = await scoreListingsWithBoardPeers(targets, peerPool)
    const scoreById = new Map<string, number>()
    for (const row of scored) {
      const id = listingIdentity(row.listing)
      if (id) scoreById.set(id, row.score.composite)
    }

    return {
      ...result,
      sold: attachScores(result.sold, scoreById),
      active: attachScores(result.active, scoreById),
    }
  } catch (err) {
    console.warn('[listing-comparables-score] score failed', err)
    return {
      ...result,
      sold: result.sold.map((c) => ({ ...c, goldilocksScore: null })),
      active: result.active.map((c) => ({ ...c, goldilocksScore: null })),
    }
  }
}

/** Build + score in one pass when callers already hold ranked listing rows. */
export async function buildScoredComparableListings(
  subject: Listing,
  sold: Listing[],
  active: Listing[],
): Promise<{ sold: ComparableListing[]; active: ComparableListing[] }> {
  const base = {
    sold: sold.map(buildComparableListing),
    active: active.map(buildComparableListing),
  }
  const enriched = await enrichComparablesWithScores(subject, {
    sold: base.sold,
    active: base.active,
    criteria: null,
    missingCriteria: [],
  }, sold, active)
  return { sold: enriched.sold, active: enriched.active }
}
