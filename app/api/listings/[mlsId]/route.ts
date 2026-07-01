import { NextResponse } from 'next/server'
import { fetchListingByMlsId, listingCacheHeaders } from '@/lib/listings-store'
import { fetchAllPhotoUrls } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  try {
    const { listing, source } = await fetchListingByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }
    // Prefer listingKey for photo retrieval; fall back to mlsId
    const photoKey = listing.listingKey || id
    // Use the URL id for proxy paths so photo routes resolve the same listing
    const photos = await fetchAllPhotoUrls(photoKey, id, listing.photoCount)
    return NextResponse.json(
      { listing, photos, source },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings/[mlsId]] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listing detail' },
      { status: 502 },
    )
  }
}
