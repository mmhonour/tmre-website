import { NextResponse } from 'next/server'
import { warmListingTabData } from '@/lib/warm-listing-tabs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fire-and-forget warm of all listing-detail tab data (comparables, comparable
 * rentals, If estimate, hero photos) so tab switches serve from cache. Called
 * once when a property is opened in Listings or Spotlight.
 *
 * Body `{ "gallery": true }` (or `?gallery=1`) widens photo warm for the Photos
 * tab so cold Active / UAG / associated Closed galleries populate on demand.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  let gallery = new URL(req.url).searchParams.get('gallery') === '1'
  try {
    const body = (await req.json()) as { gallery?: boolean } | null
    if (body?.gallery === true) gallery = true
  } catch {
    /* no / invalid JSON — query param still applies */
  }

  try {
    const result = await warmListingTabData(id, { gallery })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/listings/[mlsId]/warm] error', err)
    return NextResponse.json({ error: 'Failed to warm listing' }, { status: 502 })
  }
}
