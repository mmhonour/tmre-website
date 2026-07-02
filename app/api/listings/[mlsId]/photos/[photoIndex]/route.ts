import { NextResponse } from 'next/server'
import { fetchListingByMlsId } from '@/lib/listings-store'
import { fetchAllPhotoUrls, withRetsClient } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHOTO_TYPES = ['Photo', 'LargePhoto', 'HiRes', 'Thumbnail']

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string; photoIndex: string }> },
) {
  const { mlsId, photoIndex } = await ctx.params
  const id = (mlsId ?? '').trim()
  const index = parseInt(photoIndex ?? '0', 10)

  if (!id) return new NextResponse('Missing mlsId', { status: 400 })

  try {
    const { listing } = await fetchListingByMlsId(id)
    const photoKey = listing?.listingKey || id
    const photos = await fetchAllPhotoUrls(photoKey, id, listing?.photoCount)
    const direct = photos[index]
    if (direct?.startsWith('http')) {
      return NextResponse.redirect(direct)
    }

    for (const photoType of PHOTO_TYPES) {
      try {
        const result: Buffer | null = await withRetsClient(async (client) => {
          const all = await client.objects.getAllObjects(
            'Property',
            photoType,
            photoKey,
            { Location: 0, alwaysGroupObjects: true },
          )
          const items: any[] = Array.isArray(all)
            ? all
            : Array.isArray(all?.objects)
            ? all.objects
            : []
          const item = items[index]
          if (!item) return null
          const buf =
            item.dataBuffer ??
            item.data ??
            (Buffer.isBuffer(item) ? item : null)
          return buf instanceof Buffer ? buf : null
        })

        if (result) {
          return new NextResponse(result as unknown as BodyInit, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      } catch {
        // try next type
      }
    }

    return new NextResponse('No photo found', { status: 404 })
  } catch (err) {
    console.error('[photo-proxy] error', err)
    return new NextResponse('Photo unavailable', { status: 502 })
  }
}
