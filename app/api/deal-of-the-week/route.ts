import { NextResponse } from 'next/server'
import { fetchActiveListingsAcrossTowns, listingCacheHeaders } from '@/lib/listings-store'
import { TMRE_MARKET_TOWNS } from '@/lib/rets'
import { computeTopDeal } from '@/lib/deal-pick'
import { filterListingsToTmreTowns, TMRE_TOWNS } from '@/lib/tmre-towns'

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
    const { listings: rawListings, source } = await fetchActiveListingsAcrossTowns(
      TMRE_MARKET_TOWNS,
      { limit: 500 },
    )
    const listings = filterListingsToTmreTowns(rawListings)

    const payload = await computeTopDeal(listings)
    if (!payload) {
      return NextResponse.json(
        {
          error: 'No qualifying listings found',
          totalReviewed: listings.length,
          towns: [...TMRE_TOWNS],
        },
        { status: 404 },
      )
    }

    const response = {
      ...payload,
      scope: { towns: [...TMRE_TOWNS] },
      source,
    }
    cache = { value: response, expiresAt: Date.now() + CACHE_TTL_MS }
    return NextResponse.json(response, { headers: listingCacheHeaders(source) })
  } catch (err) {
    console.error('[/api/deal-of-the-week] error', err)
    return NextResponse.json(
      { error: 'Failed to compute deal of the week' },
      { status: 502 },
    )
  }
}
