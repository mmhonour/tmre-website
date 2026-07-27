import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  readInventorySnapshot,
  readLiveTableCounts,
} from '@/lib/db/listings-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Feed for Admin → Database → Inventory comparison.
 * Snapshot = counts saved after last successful full resync.
 * liveCounts = exact COUNT(*) now (not pg_stat estimates).
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [snapshot, liveCounts] = await Promise.all([
    readInventorySnapshot().catch(() => null),
    readLiveTableCounts().catch(() => ({}) as Record<string, number>),
  ])

  return NextResponse.json({
    snapshot,
    liveCounts,
    at: new Date().toISOString(),
  })
}
