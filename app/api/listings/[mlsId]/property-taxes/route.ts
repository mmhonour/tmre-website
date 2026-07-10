import { NextResponse } from 'next/server'
import { resolveListingPropertyTaxHistory } from '@/lib/listing-property-tax-cache'
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
    const result = await resolveListingPropertyTaxHistory(id)
    if (!result) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const { source, ...payload } = result
    return NextResponse.json(payload, {
      headers: listingCacheHeaders(source),
    })
  } catch (err) {
    console.error('[/api/listings/[mlsId]/property-taxes] error', err)
    return NextResponse.json(
      { error: 'Failed to load property tax history' },
      { status: 502 },
    )
  }
}
