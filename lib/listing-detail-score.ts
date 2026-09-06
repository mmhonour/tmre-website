import 'server-only'

import { fetchBoardPeerPool, scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { buildInsight, type ScoreBreakdown } from '@/lib/goldilocks'
import {
  medianPpsfBand,
  type MedianPpsfBand,
} from '@/lib/insight-median-ppsf'
import type { LocationEstimate } from '@/lib/listing-location-estimates'
import { readLocationEstimateForListing } from '@/lib/listing-location-estimates-resolve'
import type { Listing } from '@/lib/rets'
import { resolveListingTown } from '@/lib/tmre-towns'

export type ListingDetailScore = {
  breakdown: ScoreBreakdown
  insight: string
  cityMedianPpsf: number | null
  pricePerSqft: number | null
  medianPpsfBand: MedianPpsfBand | null
  locationEstimate: LocationEstimate | null
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
    const locationEstimate = await readLocationEstimateForListing(
      listing,
      cityMedianPpsf,
    ).catch((err) => {
      console.warn('[listing-detail-score] location estimate read failed', err)
      return null
    })
    return {
      breakdown: row.score,
      insight: buildInsight({ ...row, locationEstimate }),
      cityMedianPpsf,
      pricePerSqft,
      medianPpsfBand: band,
      locationEstimate,
    }
  } catch (err) {
    console.warn('[listing-detail-score] score failed', err)
    return null
  }
}
