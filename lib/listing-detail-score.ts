import 'server-only'

import { fetchBoardPeerPool, scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import type { ScoreBreakdown } from '@/lib/goldilocks'
import type { Listing } from '@/lib/rets'
import { resolveListingTown } from '@/lib/tmre-towns'

export async function scoreListingForDetailPage(
  listing: Listing,
): Promise<ScoreBreakdown | null> {
  const town = resolveListingTown(listing.address.city)
  if (!town) return null

  try {
    const peerPool = await fetchBoardPeerPool(town)
    const scored = await scoreListingsWithBoardPeers([listing], peerPool)
    return scored[0]?.score ?? null
  } catch (err) {
    console.warn('[listing-detail-score] score failed', err)
    return null
  }
}
