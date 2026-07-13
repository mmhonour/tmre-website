import { NextResponse } from 'next/server'
import { resolveUagForSubject } from '@/lib/listing-uag-resolve'
import { readListingFromDbByMlsId } from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Under-agreement (under-contract) comps for a listing: rental + sale columns. */
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
    const { listing: subject } = await readListingFromDbByMlsId(id)
    if (!subject) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const payload = await resolveUagForSubject(subject)

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/listings/[mlsId]/uag] error', err)
    return NextResponse.json(
      { error: 'Failed to load under-agreement comps' },
      { status: 502 },
    )
  }
}
