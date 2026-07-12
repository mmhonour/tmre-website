import { NextResponse } from 'next/server'
import {
  readAllCachedIntelligenceTownSnapshots,
  rebuildIntelligenceTownSnapshots,
} from '@/lib/intelligence-town-snapshot'
import { getSyncMeta } from '@/lib/db/sync-meta-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bulk town market snapshots for Latest sidebar — served from stats_cache. */
export async function GET() {
  try {
    let snapshots = await readAllCachedIntelligenceTownSnapshots()
    if (snapshots.length === 0) {
      await rebuildIntelligenceTownSnapshots()
      snapshots = await readAllCachedIntelligenceTownSnapshots()
    }
    return NextResponse.json(
      {
        snapshots,
        count: snapshots.length,
        lastBuiltAt: getSyncMeta('last_town_snapshots'),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      },
    )
  } catch (err) {
    console.error('[/api/intelligence/town-snapshots]', err)
    return NextResponse.json({ error: 'Failed to load town snapshots' }, { status: 502 })
  }
}
