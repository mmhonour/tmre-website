import { NextResponse } from 'next/server'
import {
  rebuildDealOfTheWeekCache,
  readDealOfTheWeekCache,
} from '@/lib/deal-of-the-week-cache'
import { dealListingPhotoUrl } from '@/lib/deal-pick'
import { listingCacheHeaders } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    let cached = readDealOfTheWeekCache()
    if (!cached) {
      await rebuildDealOfTheWeekCache()
      cached = readDealOfTheWeekCache()
    }
    if (!cached) {
      return NextResponse.json(
        { error: 'No qualifying listings found' },
        { status: 404 },
      )
    }

    const photoUrl = cached.photoUrl || dealListingPhotoUrl(cached.listing)
    return NextResponse.json(
      { ...cached, photoUrl, dealCache: true },
      {
        headers: {
          ...listingCacheHeaders(cached.source ?? 'db'),
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      },
    )
  } catch (err) {
    console.error('[/api/deal-of-the-week] error', err)
    return NextResponse.json(
      { error: 'Failed to compute deal of the week' },
      { status: 502 },
    )
  }
}
