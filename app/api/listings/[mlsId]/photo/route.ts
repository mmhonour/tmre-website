import { NextResponse } from 'next/server'
import { fetchListingByMlsId } from '@/lib/listings-store'
import { fetchPreferredPhotoUrl } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) return NextResponse.json({ url: null })

  try {
    // Resolve listing to get listingKey, which RETS needs for photo retrieval
    const { listing } = await fetchListingByMlsId(id)
    const photoKey = listing?.listingKey || id
    const url = await fetchPreferredPhotoUrl(photoKey, id)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ url: null })
  }
}
