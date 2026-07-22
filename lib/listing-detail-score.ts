import 'server-only'

import { fetchBoardPeerPool, scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { buildInsight, type ScoreBreakdown } from '@/lib/goldilocks'
import {
  medianPpsfBand,
  type MedianPpsfBand,
} from '@/lib/insight-median-ppsf'
import type { Listing } from '@/lib/rets'
import { resolveListingTown } from '@/lib/tmre-towns'

export type ListingDetailScore = {
  breakdown: ScoreBreakdown
  insight: string
  cityMedianPpsf: number | null
  pricePerSqft: number | null
  medianPpsfBand: MedianPpsfBand | null
}

export async function scoreListingForDetailPage(
  listing: Listing,
): Promise<ListingDetailScore | null> {
  const town = resolveListingTown(listing.address.city)
  if (!town) return null

  try {
    const peerPool = await fetchBoardPeerPool(town)
    const scored = await scoreListingsWithBoardPeers([listing], peerPool)
    const row = scored[0]
    if (!row) return null
    const cityMedianPpsf = row.cityMedianPpsf
    const pricePerSqft = row.pricePerSqft
    const band =
      pricePerSqft != null && cityMedianPpsf != null && cityMedianPpsf > 0
        ? medianPpsfBand(pricePerSqft, cityMedianPpsf)
        : null
    return {
      breakdown: row.score,
      insight: buildInsight(row),
      cityMedianPpsf,
      pricePerSqft,
      medianPpsfBand: band,
    }
  } catch (err) {
    console.warn('[listing-detail-score] score failed', err)
    return null
  }
}
