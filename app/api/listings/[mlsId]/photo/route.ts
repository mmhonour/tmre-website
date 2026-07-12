import { NextResponse } from 'next/server'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { resolveListingPhotoBuffer } from '@/lib/listing-photo-store'

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
    const listing = await readListingByIdFromDb(id)
    if (!listing) return NextResponse.json({ url: null }, { status: 404 })
    const photoKey = listing.listingKey?.trim() || id
    const resolved = await resolveListingPhotoBuffer({
      mlsId: id,
      listingKey: photoKey,
      photoIndex: 0,
      photoCountHint: listing.photoCount,
      sqliteOnly: true,
    })
    if (!resolved) return NextResponse.json({ url: null })
    return NextResponse.json({
      url: `/api/listings/${encodeURIComponent(id)}/photos/0`,
    })
  } catch {
    return NextResponse.json({ url: null })
  }
}
