import { NextResponse } from 'next/server'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { fetchListingPhotoCaptions } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** MLS Media captions (ImageOf / ShortDescription) in gallery order. */
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
    const { listing } = await readListingFromDbByMlsId(id)
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const captions = await fetchListingPhotoCaptions(
      listing.listingKey,
      listing.mlsId,
    )
    return NextResponse.json({ captions })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/photo-captions] error', err)
    return NextResponse.json({ captions: [] })
  }
}
