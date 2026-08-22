import { NextRequest, NextResponse } from 'next/server'
import {
  readTownZipsCached,
  readTownZipsForSubjectZip,
  readTownZipsPayload,
  rebuildTownZipsCache,
  staticTownZips,
} from '@/lib/town-zips-cache'
import { isTmreTown, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/town-zips?town=Norwalk
 * GET /api/town-zips?zip=06854
 *
 * Distinct zips for a TMRE town from Postgres stats_cache (never RETS).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const townParam = searchParams.get('town')?.trim() ?? ''
  const zipParam = searchParams.get('zip')?.trim() ?? ''

  try {
    let payload = await readTownZipsPayload()
    if (!payload) {
      try {
        await rebuildTownZipsCache()
        payload = await readTownZipsPayload()
      } catch (err) {
        console.warn('[/api/town-zips] rebuild on miss failed', err)
      }
    }

    if (zipParam) {
      const { town, zips } = await readTownZipsForSubjectZip(zipParam)
      return NextResponse.json(
        {
          town,
          zips,
          source: payload ? 'stats_cache' : 'static',
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
            // Netlify's CDN drops query params from the cache key unless told
            // otherwise — without this every zip/town gets the first response.
            'Netlify-Vary': 'query',
          },
        },
      )
    }

    if (townParam && isTmreTown(townParam)) {
      const town = townParam as TmreTown
      const zips = payload?.towns?.[town]?.length
        ? payload.towns[town]
        : await readTownZipsCached(town)
      return NextResponse.json(
        {
          town,
          zips: zips.length ? zips : staticTownZips(town),
          source: payload ? 'stats_cache' : 'static',
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
            'Netlify-Vary': 'query',
          },
        },
      )
    }

    return NextResponse.json(
      { error: 'Provide ?town= or ?zip=' },
      { status: 400 },
    )
  } catch (err) {
    console.error('[/api/town-zips]', err)
    return NextResponse.json({ error: 'Failed to load town zips' }, { status: 502 })
  }
}
