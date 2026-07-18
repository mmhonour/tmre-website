import { NextRequest, NextResponse } from 'next/server'
import {
  listingRowId,
  readAllListingsFromDb,
  readListingScoresByIds,
  readListingsFromDb,
} from '@/lib/db/listings-repo'
import { parseListingKindParam } from '@/lib/listing-kind'
import { listingCacheHeaders } from '@/lib/listings-store'
import { computeAvgScoreByVintage } from '@/lib/stats-compute'
import { readAvgScoreByVintage, writeStatsCache } from '@/lib/stats-cache'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()

  if (!city) {
    return NextResponse.json({ error: 'city is required (town name or "All")' }, { status: 400 })
  }

  if (city !== 'All' && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  const kind = parseListingKindParam(searchParams.get('kind'))

  try {
    const cached = await readAvgScoreByVintage(city, kind)
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          source: 'db',
          statsCache: true,
          generatedAt: cached.generatedAt ?? new Date().toISOString(),
        },
        { headers: { ...listingCacheHeaders('db'), 'X-Stats-Cache': 'hit' } },
      )
    }

    const active =
      city === 'All'
        ? await readAllListingsFromDb(TMRE_TOWNS, 'Active')
        : await readListingsFromDb(city, 'Active', 500)

    const ids = active.map((l) => listingRowId(l)).filter(Boolean)
    const scoreMap = await readListingScoresByIds(ids)
    const scored = active
      .map((listing) => {
        const id = listingRowId(listing)
        const score = id ? scoreMap.get(id)?.score : null
        if (score == null || !Number.isFinite(score)) return null
        return {
          yearBuilt: listing.yearBuilt,
          goldilocksScore: score,
          propertyType: listing.propertyType,
          raw: listing.raw,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    const payload = computeAvgScoreByVintage(scored, city, kind)
    const generatedAt = new Date().toISOString()
    await writeStatsCache('avg-score-by-vintage', city, kind, {
      ...payload,
      generatedAt,
    })

    return NextResponse.json(
      { ...payload, generatedAt, source: 'db', statsCache: false },
      { headers: listingCacheHeaders('db') },
    )
  } catch (err) {
    console.error('[/api/avg-score-by-vintage] error', err)
    return NextResponse.json(
      { error: 'Failed to compute average score by vintage' },
      { status: 500 },
    )
  }
}
