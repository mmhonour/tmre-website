import { NextResponse } from 'next/server'
import { fetchListingIfPayload } from '@/lib/listing-if-cache'
import { listingCacheHeaders } from '@/lib/listings-store'

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
    const payload = await fetchListingIfPayload(id)
    if (!payload) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    return NextResponse.json(payload, {
      headers: listingCacheHeaders('db'),
    })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/if] error', err)
    return NextResponse.json(
      { error: 'Failed to load If estimates' },
      { status: 502 },
    )
  }
}
