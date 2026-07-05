import { NextResponse } from 'next/server'
import { resolveListingPhotoUrls } from '@/lib/listing-photos-cache'
import { scoreListingForDetailPage } from '@/lib/listing-detail-score'
import { fetchListingByMlsId, listingCacheHeaders, persistListingRecord } from '@/lib/listings-store'
import { getListingByMlsId } from '@/lib/rets'

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

  const direct = new URL(req.url).searchParams.get('direct') === '1'
  const includePhotos = new URL(req.url).searchParams.get('photos') !== '0'

  try {
    const { listing, source } = direct
      ? { listing: await getListingByMlsId(id), source: 'rets' as const }
      : await fetchListingByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }
    persistListingRecord(listing)
    const [photos, goldilocksBreakdown] = await Promise.all([
      includePhotos
        ? resolveListingPhotoUrls(
            id,
            listing.listingKey || id,
            listing.photoCount,
            { forceRefresh: direct },
          ).then((r) => r.photos)
        : Promise.resolve([] as string[]),
      scoreListingForDetailPage(listing),
    ])
    const servedSource = direct ? 'rets' : source
    return NextResponse.json(
      {
        listing,
        photos,
        goldilocksScore: goldilocksBreakdown?.composite ?? null,
        goldilocksBreakdown,
        source: servedSource,
      },
      { headers: listingCacheHeaders(direct ? 'rets' : source) },
    )
  } catch (err) {
    console.error('[/api/listings/[mlsId]] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listing detail' },
      { status: 502 },
    )
  }
}
