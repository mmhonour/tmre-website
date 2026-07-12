import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { pingDatabase } from '@/lib/db/postgres'
import {
  captureInventorySnapshot,
  countListings,
  countListingsByBucket,
  readInventorySnapshot,
  readLatestListingModificationTimestamp,
} from '@/lib/db/listings-repo'
import { syncAllTownListingsPg } from '@/lib/db/listings-sync-pg'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

// Internal Phase-3 backfill/verify endpoint (NOT user-facing). Runs the RETS →
// Postgres resync scoped by town/bucket so a one-time backfill stays inside the
// Lambda time budget, then reports row counts for fidelity checks. The live
// SQLite read path is untouched — this only populates Neon.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ALL_BUCKETS = ['Active', 'Closed', 'Expired'] as const
type StatusBucket = (typeof ALL_BUCKETS)[number]

async function buildVerification() {
  const [ping, total, byBucket, latest, snapshot] = await Promise.all([
    pingDatabase(),
    countListings(),
    countListingsByBucket(),
    readLatestListingModificationTimestamp(),
    readInventorySnapshot(),
  ])
  return {
    ping,
    listings: { total, byBucket },
    latestListingUpdate: latest,
    inventorySnapshot: snapshot,
  }
}

/** GET — verify only: connectivity + current Postgres row counts. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, verify: await buildVerification() })
}

/**
 * POST — run the scoped RETS → Postgres backfill, then verify.
 * Body: { towns?: string[]; buckets?: ('Active'|'Closed'|'Expired')[] }
 * Omitting a field runs all of that dimension.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let towns: TmreTown[] | undefined
  let buckets: StatusBucket[] | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as {
      towns?: string[]
      buckets?: string[]
    }
    if (Array.isArray(body.towns)) {
      const allowed = new Set<string>(TMRE_TOWNS)
      towns = body.towns.filter((t): t is TmreTown => allowed.has(t))
      if (towns.length === 0) {
        return NextResponse.json({ error: 'No valid towns in request' }, { status: 400 })
      }
    }
    if (Array.isArray(body.buckets)) {
      const allowed = new Set<string>(ALL_BUCKETS)
      buckets = body.buckets.filter((b): b is StatusBucket => allowed.has(b))
      if (buckets.length === 0) {
        return NextResponse.json({ error: 'No valid buckets in request' }, { status: 400 })
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await syncAllTownListingsPg({ towns, buckets })
    await captureInventorySnapshot()
    return NextResponse.json({ ok: true, result, verify: await buildVerification() })
  } catch (err) {
    console.error('[/api/admin/pg-backfill]', err)
    return NextResponse.json(
      { ok: false, error: 'Backfill failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
