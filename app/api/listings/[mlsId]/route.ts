import { NextResponse } from 'next/server'
import { resolveMarketBandLabelForListing } from '@/lib/inventory-segment-bands-config'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import { scoreListingForDetailPage } from '@/lib/listing-detail-score'
import { resolveListingVisionLink } from '@/lib/listing-vision-link'
import { listingCacheHeaders, readListingFromDbByMlsId } from '@/lib/listings-store'
import { resolveListingMapPoint } from '@/lib/listing-map-point'
import {
  listingRowId,
  readListingEdgeScoreByMlsId,
  upsertListingScores,
} from '@/lib/db/listings-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  const includePhotos = new URL(req.url).searchParams.get('photos') !== '0'

  try {
    const { listing } = await readListingFromDbByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }
    const [photos, detailScore, edgeScoreRow, marketBandLabel, vision, mapPoint] =
      await Promise.all([
      includePhotos
        ? resolveListingPhotoUrls(
            id,
            listing.listingKey || id,
            listing.photoCount,
            { sqliteOnly: true, size: 'full' },
          ).then((r) => r.photos)
        : Promise.resolve([] as string[]),
      scoreListingForDetailPage(listing),
      readListingEdgeScoreByMlsId(id),
      resolveMarketBandLabelForListing(listing),
      resolveListingVisionLink(listing),
      resolveListingMapPoint(listing).catch((err) => {
        console.warn(
          '[/api/listings/[mlsId]] mapPoint failed',
          err instanceof Error ? err.message : err,
        )
        return null
      }),
    ])

    // Persist so Latest / board caches stop showing 0.0 for listings that
    // detail already knows how to score.
    if (detailScore) {
      const rowId = listingRowId(listing)
      if (rowId) {
        void upsertListingScores([
          {
            id: rowId,
            score: detailScore.breakdown.composite,
            breakdownJson: JSON.stringify(detailScore.breakdown),
            scoredAt: new Date().toISOString(),
          },
        ]).catch((err) => {
          console.warn(
            '[/api/listings/[mlsId]] score persist failed',
            err instanceof Error ? err.message : err,
          )
        })
      }
    }

    return NextResponse.json(
      {
        listing,
        photos,
        goldilocksScore: detailScore?.breakdown.composite ?? null,
        goldilocksBreakdown: detailScore?.breakdown ?? null,
        insight: detailScore?.insight ?? null,
        cityMedianPpsf: detailScore?.cityMedianPpsf ?? null,
        pricePerSqft: detailScore?.pricePerSqft ?? null,
        medianPpsfBand: detailScore?.medianPpsfBand ?? null,
        locationEstimate: detailScore?.locationEstimate ?? null,
        marketBandLabel,
        edgeScore: edgeScoreRow?.edgeScore ?? null,
        edgeScoreBreakdown: edgeScoreRow?.breakdownJson
          ? (JSON.parse(edgeScoreRow.breakdownJson) as Record<string, unknown>)
          : null,
        /** VGSI parcel pairing for the Admin panel; null outside Westport. */
        vision,
        /**
         * Display pin for listing maps. MLS when that point sits in the
         * named town; otherwise a Census geocode of the street address.
         * Does not overwrite `listing.latitude` / `listing.longitude`.
         */
        mapPoint,
        source: 'db',
      },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/listings/[mlsId]] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listing detail' },
      { status: 502 },
    )
  }
}
