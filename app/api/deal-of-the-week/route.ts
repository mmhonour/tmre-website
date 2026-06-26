import { NextResponse } from 'next/server'
import { searchListings, fetchPreferredPhotoUrl } from '@/lib/rets'
import { runScoring, buildInsight, cheapShortlist } from '@/lib/goldilocks'
import { resolveSchoolRatings } from '@/lib/greatschools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CacheEntry = { value: unknown; expiresAt: number }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cache: CacheEntry | null = null

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.value)
  }

  try {
    const listings = await searchListings({
      county: 'Fairfield',
      status: 'Active',
      limit: 2500,
    })

    const shortlist = cheapShortlist(listings)
    const schoolRatings = await resolveSchoolRatings(shortlist)
    const { scored, rejected } = runScoring(listings, { schoolRatings })
    const winner = scored[0]

    if (!winner) {
      return NextResponse.json(
        {
          error: 'No qualifying listings found',
          totalReviewed: listings.length,
          rejectedCount: rejected.length,
        },
        { status: 404 },
      )
    }

    const insight = buildInsight(winner)
    const photoUrl = await fetchPreferredPhotoUrl(
      winner.listing.mlsId || winner.listing.listingKey,
    )

    const payload = {
      generatedAt: new Date().toISOString(),
      totalReviewed: listings.length,
      qualifiedCount: scored.length,
      rejectedCount: rejected.length,
      kind: winner.kind,
      insight,
      score: winner.score,
      pricePerSqft: winner.pricePerSqft,
      cityMedianPricePerSqft: winner.cityMedianPpsf,
      photoUrl,
      listing: winner.listing,
      runnerUps: scored.slice(1, 4).map((s) => ({
        mlsId: s.listing.mlsId,
        address: s.listing.address.full,
        composite: s.score.composite,
      })),
    }
    cache = { value: payload, expiresAt: Date.now() + CACHE_TTL_MS }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/deal-of-the-week] error', err)
    return NextResponse.json(
      { error: 'Failed to compute deal of the week' },
      { status: 502 },
    )
  }
}
