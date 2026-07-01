import { NextResponse } from 'next/server'
import { fetchListingByMlsId } from '@/lib/listings-store'
import { fetchAllPhotoUrls } from '@/lib/rets'
import * as rets from 'rets-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHOTO_TYPES = ['Photo', 'LargePhoto', 'HiRes', 'Thumbnail']

function requireEnv() {
  const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env
  if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
    throw new Error('RETS env vars missing')
  }
  return {
    loginUrl: RETS_SERVER_URL,
    username: RETS_USERNAME,
    password: RETS_PASSWORD,
    version: 'RETS/1.7.2',
    userAgent: 'tmre-website/0.1',
  }
}

async function withClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const settings = requireEnv()
  let value: T | undefined
  let error: unknown
  let captured = false
  await (rets as any).getAutoLogoutClient(settings, async (client: unknown) => {
    try {
      value = await fn(client)
      captured = true
    } catch (err) {
      error = err
      captured = true
    }
  })
  if (!captured) throw new Error('RETS client closed without returning')
  if (error) throw error
  return value as T
}

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
        const result: Buffer | null = await withClient(async (client) => {
          const all = await client.objects.getAllObjects(
            'Property',
            photoType,
            photoKey,
            { Location: 0, alwaysGroupObjects: true },
          )
          // rets-client returns array of objects with dataBuffer
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
