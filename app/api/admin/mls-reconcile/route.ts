import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { getSyncMeta } from '@/lib/db/sync-meta'
import { LATEST_GLOBAL_FEED_CACHE_KEY } from '@/lib/latest-feed-cache'
import { reconcileTownInventory } from '@/lib/mls-reconciliation'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One town per request: 7 towns of RETS in a single request 504s at the gateway.
export const maxDuration = 300

type Freshness = {
  lastIncrementalSync: string | null
  latestFeedCacheKey: string
  latestFeedGeneratedAt: string | null
  latestFeedAgeMinutes: number | null
  latestFeedRowCount: number | null
}

/** Never hardcode the feed cache key — a stale 'v1' guess reported a dead row. */
async function readFreshness(): Promise<Freshness> {
  const [lastIncrementalSync, row] = await Promise.all([
    getSyncMeta('last_incremental_sync'),
    readStatsCacheRow(LATEST_GLOBAL_FEED_CACHE_KEY),
  ])

  let generatedAt: string | null = null
  let rowCount: number | null = null
  if (row?.payload) {
    try {
      const parsed = JSON.parse(row.payload) as {
        generatedAt?: string
        listings?: unknown[]
      }
      generatedAt = parsed.generatedAt ?? row.computedAt ?? null
      rowCount = Array.isArray(parsed.listings) ? parsed.listings.length : null
    } catch {
      generatedAt = row.computedAt ?? null
    }
  }

  const generatedMs = generatedAt ? Date.parse(generatedAt) : Number.NaN
  return {
    lastIncrementalSync,
    latestFeedCacheKey: LATEST_GLOBAL_FEED_CACHE_KEY,
    latestFeedGeneratedAt: generatedAt,
    latestFeedAgeMinutes: Number.isFinite(generatedMs)
      ? Math.max(0, Math.round((Date.now() - generatedMs) / 60_000))
      : null,
    latestFeedRowCount: rowCount,
  }
}

/**
 * GET /api/admin/mls-reconcile?town=Westport
 *
 * Read-only comparison of the live MLS Active set against Postgres for ONE
 * town, by MLS number. The Admin panel loops the towns client-side.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const townParam = req.nextUrl.searchParams.get('town')?.trim() ?? ''
  const town = TMRE_TOWNS.find(
    (t) => t.toLowerCase() === townParam.toLowerCase(),
  ) as TmreTown | undefined

  if (!town) {
    return NextResponse.json(
      {
        error: townParam
          ? `Unknown town "${townParam}"`
          : 'Provide ?town= (one town per request)',
        towns: TMRE_TOWNS,
      },
      { status: 400 },
    )
  }

  try {
    const [result, freshness] = await Promise.all([
      reconcileTownInventory(town),
      readFreshness(),
    ])
    return NextResponse.json({
      ...result,
      ...freshness,
      note: 'Compared by MLS number only — never by date. Read-only: no upserts or cache writes.',
    })
  } catch (err) {
    console.error('[/api/admin/mls-reconcile] GET', err)
    return NextResponse.json(
      {
        town,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to reconcile town inventory',
      },
      { status: 500 },
    )
  }
}
