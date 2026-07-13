import { NextResponse } from 'next/server'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { resolveListingPhotoBuffer } from '@/lib/listing-photo-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHOTO_CACHE_CONTROL = 'public, max-age=1800, stale-while-revalidate=3600'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ mlsId: string; photoIndex: string }> },
) {
  const { mlsId, photoIndex } = await ctx.params
  const allowFetch = new URL(req.url).searchParams.get('fetch') === '1'
  const id = (mlsId ?? '').trim()
  const index = parseInt(photoIndex ?? '0', 10)

  if (!id) return new NextResponse('Missing mlsId', { status: 400 })
  if (!Number.isFinite(index) || index < 0) {
    return new NextResponse('Invalid photo index', { status: 400 })
  }

  try {
    const listing = await readListingByIdFromDb(id)
    // Photos are cached under listingPhotoCacheId() = listingKey || mlsId. The
    // request id may be EITHER the MLS number (spotlight/listing detail pages) or
    // the listingKey (deal board / intelligence). Resolve to the same cache id the
    // sync writes under so both entry points hit the same blob — otherwise an
    // MLS-number request misses the listingKey-keyed cache and 404s.
    const photoKey = listing?.listingKey?.trim() || id
    const resolved = await resolveListingPhotoBuffer({
      mlsId: photoKey,
      listingKey: photoKey,
      photoIndex: index,
      photoCountHint: listing?.photoCount,
      sqliteOnly: !allowFetch,
    })

    if (!resolved) {
      return new NextResponse('No photo found', { status: 404 })
    }

    return new NextResponse(resolved.data as unknown as BodyInit, {
      headers: {
        'Content-Type': resolved.contentType,
        'Cache-Control': PHOTO_CACHE_CONTROL,
        'X-Photo-Cache': resolved.cacheHit ? 'hit' : 'miss',
      },
    })
  } catch (err) {
    console.error('[photo-proxy] error', err)
    return new NextResponse('Photo unavailable', { status: 502 })
  }
}
