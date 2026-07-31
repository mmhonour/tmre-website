import { NextRequest, NextResponse } from 'next/server'
import { resolveMarketBandLabelForListing } from '@/lib/inventory-segment-bands-config'
import { scoreListingForDetailPage } from '@/lib/listing-detail-score'
import { spotlightApiCacheHeaders } from '@/lib/listings-store'
import { resolveSpotlightListing } from '@/lib/spotlight-cache'
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
} from '@/lib/spotlight-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const includePhotos = searchParams.get('photos') === '1'
  const propertyTab = parseSpotlightPropertyTab(searchParams.get('property'))
  const config = getSpotlightListingConfig(propertyTab)

  try {
    const { listing, photos, source, cacheHit } = await resolveSpotlightListing({
      includePhotos,
      config,
      propertyTab,
    })

    const [detailScore, marketBandLabel] = listing
      ? await Promise.all([
          scoreListingForDetailPage(listing),
          resolveMarketBandLabelForListing(listing),
        ])
      : [null, null]

    return NextResponse.json(
      {
        listing,
        photos: includePhotos ? photos : undefined,
        goldilocksScore: detailScore?.breakdown.composite ?? null,
        goldilocksBreakdown: detailScore?.breakdown ?? null,
        insight: detailScore?.insight ?? null,
        cityMedianPpsf: detailScore?.cityMedianPpsf ?? null,
        pricePerSqft: detailScore?.pricePerSqft ?? null,
        medianPpsfBand: detailScore?.medianPpsfBand ?? null,
        marketBandLabel,
        source,
        spotlightCache: cacheHit,
        propertyTab,
      },
      {
        headers: {
          ...spotlightApiCacheHeaders(),
          'X-Spotlight-Cache': cacheHit ? 'hit' : 'miss',
          'X-Spotlight-Property': String(propertyTab),
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
