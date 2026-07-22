import { NextResponse } from 'next/server'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { photoBackendUsesR2, readListingPhotoBytes } from '@/lib/listing-photo-backend'
import { recordPhotoProxyOutcome } from '@/lib/listing-photo-health'
import { resolveListingPhotoBuffer } from '@/lib/listing-photo-store'
import { isR2PhotoStoreConfigured } from '@/lib/r2-photo-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHOTO_HIT_CACHE_CONTROL =
  'public, max-age=1800, stale-while-revalidate=3600'

/**
 * Netlify CDN ignores query strings in the cache key unless Netlify-Vary says
 * otherwise. Without this, a cache-only 404 for `/photos/0` is reused for
 * `/photos/0?fetch=1` and ListingThumbImage's CDN retry never reaches origin.
 * `size` must vary too so full-res gallery URLs are not served thumb bytes.
 */
const PHOTO_VARY = 'query=fetch|size'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ mlsId: string; photoIndex: string }> },
) {
  const { mlsId, photoIndex } = await ctx.params
  const url = new URL(req.url)
  const allowFetch = url.searchParams.get('fetch') === '1'
  const quality =
    url.searchParams.get('size') === 'full' ? ('full' as const) : ('display' as const)
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
    // the listingKey (deal board / comps / UAG). Resolve to the same cache id the
    // sync writes under so both entry points hit the same blob.
    const photoKey = listing?.listingKey?.trim() || id
    const retsKey = listing?.listingKey?.trim() || photoKey
    const mlsId = listing?.mlsId?.trim() || (id !== photoKey ? id : '')
    const resolved = await resolveListingPhotoBuffer({
      mlsId: photoKey,
      listingKey: retsKey,
      photoIndex: index,
      photoCountHint: listing?.photoCount,
      sqliteOnly: !allowFetch,
      quality,
      // Also try MLS id when photos were cached under ListingId historically.
      alternateCacheIds: mlsId && mlsId !== photoKey ? [mlsId] : undefined,
    })

    if (!resolved) {
      if (allowFetch) recordPhotoProxyOutcome('fetch-fail')
      else recordPhotoProxyOutcome('cache-miss')
      if (url.searchParams.get('debug') === '1') {
        const direct = await readListingPhotoBytes(photoKey, index)
        return NextResponse.json(
          {
            id,
            photoKey,
            retsKey,
            mlsId: mlsId || null,
            index,
            quality,
            allowFetch,
            r2Configured: isR2PhotoStoreConfigured(),
            usesR2: photoBackendUsesR2(),
            directBytes: direct?.data.length ?? null,
            listingFound: Boolean(listing),
            photoCount: listing?.photoCount ?? null,
          },
          {
            status: 404,
            headers: {
              'Cache-Control': 'private, no-store',
              'Netlify-Vary': PHOTO_VARY,
              'X-Photo-Proxy': 'miss',
            },
          },
        )
      }
      // Never CDN-cache misses — the client retries with ?fetch=1.
      // Use 404 with an explicit image content-type so App Router does not
      // replace the body with the HTML not-found page.
      return new NextResponse('No photo found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Netlify-Vary': PHOTO_VARY,
          'X-Photo-Proxy': 'miss',
        },
      })
    }

    if (allowFetch && !resolved.cacheHit) recordPhotoProxyOutcome('fetch-ok')
    else if (resolved.cacheHit) recordPhotoProxyOutcome('cache-hit')
    else recordPhotoProxyOutcome('fetch-ok')

    return new NextResponse(resolved.data as unknown as BodyInit, {
      headers: {
        'Content-Type': resolved.contentType,
        'Cache-Control': PHOTO_HIT_CACHE_CONTROL,
        'Netlify-Vary': PHOTO_VARY,
        'X-Photo-Cache': resolved.cacheHit ? 'hit' : 'miss',
        'X-Photo-Quality': quality,
      },
    })
  } catch (err) {
    console.error('[photo-proxy] error', err)
    if (allowFetch) recordPhotoProxyOutcome('fetch-fail')
    return new NextResponse('Photo unavailable', {
      status: 502,
      headers: {
        'Cache-Control': 'private, no-store',
        'Netlify-Vary': PHOTO_VARY,
      },
    })
  }
}
