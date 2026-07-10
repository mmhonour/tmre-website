import { NextRequest, NextResponse } from 'next/server'
import { fetchActiveListingsForCity, listingCacheHeaders } from '@/lib/listings-store'
import { scoreListingsWithBoardPeers } from '@/lib/board-scoring'
import { listingRowId, readListingScoresByIds, upsertListingScores } from '@/lib/listings-db'
import { type Listing } from '@/lib/rets'
import { SCORE_PEER_LIMIT, type ScoreBreakdown } from '@/lib/goldilocks'
import { isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function daysBetween(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function parseStoredBreakdown(json: string | null | undefined): ScoreBreakdown | null {
  if (!json?.trim()) return null
  try {
    const parsed = JSON.parse(json) as ScoreBreakdown
    if (typeof parsed?.composite !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function enrich(l: Listing, score: ScoreBreakdown | null, storedComposite: number | null = null) {
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
      goldilocksScore: score?.composite ?? storedComposite,
      goldilocksBreakdown: score,
    },
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 50

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
      Math.max(limit, SCORE_PEER_LIMIT),
    )
    const listings = peerPool.slice(0, limit)
    const ids = listings.map((l) => listingRowId(l)).filter(Boolean)
    const storedScores = readListingScoresByIds(ids)

    const unscored: Listing[] = []
    const scoreById = new Map<string, ScoreBreakdown>()
    const compositeById = new Map<string, number>()

    for (const listing of listings) {
      const id = listingRowId(listing)
      if (!id) continue
      const stored = storedScores.get(id)
      const breakdown = parseStoredBreakdown(stored?.breakdownJson)
      if (breakdown) {
        scoreById.set(id, breakdown)
        compositeById.set(id, breakdown.composite)
      } else if (stored?.score != null) {
        compositeById.set(id, stored.score)
      } else {
        unscored.push(listing)
      }
    }

    // Live-score only listings not yet covered by the daily full-reload cache.
    if (unscored.length > 0) {
      const boardScores = await scoreListingsWithBoardPeers(unscored, peerPool)
      const scoredAt = new Date().toISOString()
      const persist = boardScores
        .map((row) => {
          const id = listingRowId(row.listing)
          if (!id) return null
          scoreById.set(id, row.score)
          compositeById.set(id, row.score.composite)
          return {
            id,
            score: row.score.composite,
            breakdownJson: JSON.stringify(row.score),
            scoredAt,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
      if (persist.length > 0) {
        try {
          upsertListingScores(persist)
        } catch (err) {
          console.warn(
            '[/api/listings] score persist failed',
            err instanceof Error ? err.message : err,
          )
        }
      }
    }

    return NextResponse.json(
      {
        city,
        status: 'Active',
        count: listings.length,
        source,
        listings: listings.map((l) => {
          const id = listingRowId(l)
          return enrich(l, scoreById.get(id) ?? null, compositeById.get(id) ?? null)
        }),
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
