import { NextResponse } from 'next/server'
import {
  readIntelligenceDealBoardCache,
  rebuildIntelligenceDealBoardCache,
} from '@/lib/intelligence-deal-board-cache'
import { getSyncMeta } from '@/lib/listings-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Slim scored deal-board payload for /intelligence — served from stats_cache. */
export async function GET() {
  try {
    let board = readIntelligenceDealBoardCache()
    if (!board) {
      await rebuildIntelligenceDealBoardCache()
      board = readIntelligenceDealBoardCache()
    }
    if (!board) {
      return NextResponse.json({ error: 'Deal board cache unavailable' }, { status: 404 })
    }
    return NextResponse.json(
      {
        ...board,
        lastBuiltAt: getSyncMeta('last_intelligence_deal_board'),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        },
      },
    )
  } catch (err) {
    console.error('[/api/intelligence/deal-board]', err)
    return NextResponse.json({ error: 'Failed to load deal board' }, { status: 502 })
  }
}
