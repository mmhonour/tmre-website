import 'server-only'

import { fetchActiveListingsForCity } from '@/lib/listings-store'
import {
  cheapShortlist,
  SCORE_PEER_LIMIT,
  scoreListingsForBoard,
  type ScoredListing,
  type ScoreBreakdown,
} from '@/lib/goldilocks'
import { getGoldilocksConfigFresh } from '@/lib/goldilocks-config'
import { resolveSchoolRatings } from '@/lib/greatschools'
import type { Listing } from '@/lib/rets'
import type { TmreTown } from '@/lib/tmre-towns'

/** Active + Coming Soon inventory — same peer pool as Intelligence `/api/listings`. */
export async function fetchBoardPeerPool(city: TmreTown): Promise<Listing[]> {
  const { listings } = await fetchActiveListingsForCity(city, SCORE_PEER_LIMIT)
  return listings
}

/**
 * Score listings with the same peer pool + school lookup path as Intelligence
 * `/api/listings` (Deal Table). Loads Goldilocks weights/keywords from Postgres
 * once per call so every Lambda uses the Admin-saved config.
 */
export async function scoreListingsWithBoardPeers(
  listings: Listing[],
  peerListings: Listing[],
): Promise<ScoredListing[]> {
  const config = await getGoldilocksConfigFresh()
  const shortlist = cheapShortlist(peerListings, config)
  const schoolRatings = await resolveSchoolRatings(shortlist)
  return scoreListingsForBoard(listings, {
    schoolRatings,
    peerListings,
    config,
  })
}

export async function scoreCityBoardListings(
  city: TmreTown,
  limit?: number,
): Promise<{
  peerPool: Listing[]
  scored: ScoredListing[]
  scoreById: Map<string, ScoreBreakdown>
}> {
  const peerPool = await fetchBoardPeerPool(city)
  const targets = limit != null ? peerPool.slice(0, limit) : peerPool
  const scored = await scoreListingsWithBoardPeers(targets, peerPool)
  const scoreById = new Map<string, ScoreBreakdown>()
  for (const row of scored) {
    const id = row.listing.mlsId || row.listing.listingKey
    if (id) scoreById.set(id, row.score)
  }
  return { peerPool, scored, scoreById }
}
