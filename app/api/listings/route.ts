import { NextRequest, NextResponse } from 'next/server'
import { fetchActiveListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { type Listing } from '@/lib/rets'
import { SCORE_PEER_LIMIT, type ScoreBreakdown } from '@/lib/goldilocks'
import { isTmreTown, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function daysBetween(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function enrich(l: Listing, score: ScoreBreakdown | null) {
  const pricePerSqft = l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null
  const daysOnMarket =
    l.dom != null ? l.dom : daysBetween(l.listDate ?? l.modificationTimestamp)
  const priceReductionPercent =
    l.originalListPrice && l.price && l.originalListPrice > 0 && l.originalListPrice !== l.price
      ? ((l.originalListPrice - l.price) / l.originalListPrice) * 100
      : null
  return {
    ...l,
    calculated: {
      pricePerSqft,
      daysOnMarket,
      priceReductionPercent,
      goldilocksScore: score?.composite ?? null,
      goldilocksBreakdown: score,
    },
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 50

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (e.g. ?city=Norwalk)' },
      { status: 400 },
    )
  }
  if (!isTmreTown(city)) {
    return NextResponse.json(
      { error: `Unsupported city '${city}'` },
      { status: 400 },
    )
  }

  try {
    const { listings: peerPool, source } = await fetchActiveListingsForCity(
      city,
      SCORE_PEER_LIMIT,
    )
    const listings = peerPool.slice(0, limit)
    const boardScores = await scoreListingsWithBoardPeers(listings, peerPool)
    const scoreById = new Map(
      boardScores.map((s) => [s.listing.mlsId || s.listing.listingKey, s.score]),
    )

    return NextResponse.json(
      {
        city,
        status: 'Active',
        count: listings.length,
        source,
        listings: listings.map((l) =>
          enrich(l, scoreById.get(l.mlsId || l.listingKey) ?? null),
        ),
      },
      { headers: listingCacheHeaders(source) },
    )
  } catch (err) {
    console.error('[/api/listings] error', err)
    return NextResponse.json(
      { error: 'Failed to fetch listings from MLS' },
      { status: 502 },
    )
  }
}
