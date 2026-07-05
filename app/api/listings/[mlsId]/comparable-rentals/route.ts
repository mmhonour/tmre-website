import { NextResponse } from 'next/server'
import { resolveComparablesForSubject } from '@/lib/listing-comparables-resolve'
import { fetchListingByMlsId } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same as `/comparables?kind=rental`. */
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
    const { listing: subject } = await fetchListingByMlsId(id)
    if (!subject) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const payload = await resolveComparablesForSubject(subject, 'rental')

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/listings/[mlsId]/comparable-rentals] error', err)
    return NextResponse.json(
      { error: 'Failed to load comparables' },
      { status: 502 },
    )
  }
}
