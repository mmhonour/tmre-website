import { NextResponse } from 'next/server'
import { getSyncMeta } from '@/lib/listings-db'
import {
  LATEST_TOWN_FEED_LIMIT,
  readAllLatestTownFeedCaches,
} from '@/lib/latest-town-feed-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** All pre-warmed town feeds (~7 × 30 listings) in one SQLite read. */
export async function GET() {
  try {
    const towns = readAllLatestTownFeedCaches(LATEST_TOWN_FEED_LIMIT)
    const listingCount = Object.values(towns).reduce((n, rows) => n + rows.length, 0)
    return NextResponse.json(
      {
        towns,
        townCount: Object.keys(towns).length,
        listingCount,
        lastTownFeedsWarm: getSyncMeta('last_latest_town_feeds'),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      },
    )
  } catch (err) {
    console.error('[/api/listings/latest/towns] error', err)
    return NextResponse.json(
      { error: 'Failed to load town feeds' },
      { status: 502 },
    )
  }
}
