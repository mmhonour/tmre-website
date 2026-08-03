import { NextResponse } from 'next/server'
import {
  INTELLIGENCE_DEAL_BOARD_STALE_BLOCKING_MS,
  INTELLIGENCE_DEAL_BOARD_STALE_DEFERRED_MS,
  readIntelligenceDealBoardCache,
  rebuildIntelligenceDealBoardCache,
  warmIntelligenceDealBoardDeferred,
} from '@/lib/intelligence-deal-board-cache'
import { getSyncMeta } from '@/lib/db/sync-meta-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function boardAgeMs(generatedAt: string | undefined): number | null {
  if (!generatedAt) return null
  const t = Date.parse(generatedAt)
  if (Number.isNaN(t)) return null
  return Math.max(0, Date.now() - t)
}

/** Slim scored deal-board payload for /intelligence — served from stats_cache. */
export async function GET() {
  try {
    let board = await readIntelligenceDealBoardCache()
    if (!board) {
      await rebuildIntelligenceDealBoardCache()
      board = await readIntelligenceDealBoardCache()
    }
    if (!board) {
      return NextResponse.json({ error: 'Deal board cache unavailable' }, { status: 404 })
    }

    // Lean cron can update listings without rebuilding this cache — refresh when
    // stale so Under Contract pills / scores track MLS status again.
    const ageMs = boardAgeMs(board.generatedAt)
    if (ageMs != null && ageMs >= INTELLIGENCE_DEAL_BOARD_STALE_BLOCKING_MS) {
      await rebuildIntelligenceDealBoardCache()
      board = (await readIntelligenceDealBoardCache()) ?? board
    } else if (ageMs != null && ageMs >= INTELLIGENCE_DEAL_BOARD_STALE_DEFERRED_MS) {
      warmIntelligenceDealBoardDeferred()
    }

    // Don't let the CDN pin a snapshot taken mid full-resync (towns are wiped
    // and refetched one at a time) — keep serving it, but re-check quickly.
    const refreshing = getSyncMeta('refresh_in_progress') === '1'
    const stillStale =
      (boardAgeMs(board.generatedAt) ?? 0) >= INTELLIGENCE_DEAL_BOARD_STALE_DEFERRED_MS
    return NextResponse.json(
      {
        ...board,
        lastBuiltAt:
          getSyncMeta('last_intelligence_deal_board') ?? board.generatedAt,
      },
      {
        headers: {
          'Cache-Control':
            refreshing || stillStale
              ? 'public, s-maxage=5, stale-while-revalidate=15'
              : 'public, s-maxage=120, stale-while-revalidate=600',
        },
      },
    )
  } catch (err) {
    console.error('[/api/intelligence/deal-board]', err)
    return NextResponse.json({ error: 'Failed to load deal board' }, { status: 502 })
  }
}
