import { NextRequest, NextResponse } from 'next/server'
import { getSyncMeta } from '@/lib/db/sync-meta-store'
import { fetchLatestUpdatedListings, fetchTownUpdateStats } from '@/lib/latest-listings'
import { syncListingsSmart } from '@/lib/listings-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')?.trim() || null
  const town = searchParams.get('town')?.trim() || null
  const limitRaw = Number(searchParams.get('limit') ?? '30')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 30

  // Latest listings are served from SQLite only. RETS pulls happen on the
  // background 30-minute scheduler (see instrumentation.ts), never per-request.
  try {
    const listings = await fetchLatestUpdatedListings({ since, limit, town })
    // Town-expand requests only need listings; townStats runs a heavy aggregate
    // and has caused 502s that blocked the whole response.
    const townStats = town ? [] : await fetchTownUpdateStats()
    return NextResponse.json(
      {
        listings,
        count: listings.length,
        townStats,
        since,
        lastIncrementalSync: getSyncMeta('last_incremental_sync'),
        lastFullSync: getSyncMeta('last_full_sync'),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (err) {
    console.error('[/api/listings/latest] error', err)
    return NextResponse.json(
      { error: 'Failed to load latest listings' },
      { status: 502 },
    )
  }
}

export async function POST() {
  try {
    const result = await syncListingsSmart()
    const listings = await fetchLatestUpdatedListings({ limit: 30 })
    return NextResponse.json({
      ok: result.towns.every((row) => row.ok),
      sync: result,
      listings,
      count: listings.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[/api/listings/latest] POST sync error', err)
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
