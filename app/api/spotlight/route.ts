import { NextRequest, NextResponse } from 'next/server'
import { scoreListingForDetailPage } from '@/lib/listing-detail-score'
import { listingCacheHeaders } from '@/lib/listings-store'
import { resolveSpotlightListing } from '@/lib/spotlight-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const includePhotos = new URL(req.url).searchParams.get('photos') === '1'

  try {
    const { listing, photos, source, cacheHit } = await resolveSpotlightListing({
      includePhotos,
    })

    const goldilocksBreakdown = listing
      ? await scoreListingForDetailPage(listing)
      : null

    return NextResponse.json(
      {
        listing,
        photos: includePhotos ? photos : undefined,
        goldilocksScore: goldilocksBreakdown?.composite ?? null,
        goldilocksBreakdown,
        source,
        spotlightCache: cacheHit,
      },
      {
        headers: {
          ...listingCacheHeaders(cacheHit || source === 'db' ? 'db' : source),
          'X-Spotlight-Cache': cacheHit ? 'hit' : 'miss',
        },
      },
    )
  } catch (err) {
    console.error('[/api/spotlight] error', err)
    return NextResponse.json(
      { error: 'Failed to load spotlight listing' },
      { status: 502 },
    )
  }
}
