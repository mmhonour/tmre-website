import { NextResponse } from 'next/server'
import { resolveComparablesForSubject } from '@/lib/listing-comparables-resolve'
import { parseListingKindParam } from '@/lib/listing-kind'
import { fetchListingByMlsId } from '@/lib/listings-store'

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

  const kind = parseListingKindParam(new URL(req.url).searchParams.get('kind'))

  try {
    const { listing: subject } = await fetchListingByMlsId(id)
    if (!subject) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const payload = await resolveComparablesForSubject(subject, kind)

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/listings/[mlsId]/comparables] error', err)
    return NextResponse.json(
      { error: 'Failed to load comparables' },
      { status: 502 },
    )
  }
}
