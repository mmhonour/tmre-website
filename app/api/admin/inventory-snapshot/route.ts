import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readAllTableActivity } from '@/lib/db/inventory-table-activity'
import {
  readInventorySnapshot,
  readLiveTableCounts,
} from '@/lib/db/listings-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Feed for Admin → Database → Inventory.
 * Snapshot = counts saved after last successful full resync.
 * liveCounts = exact COUNT(*) now (not pg_stat estimates).
 * activity = upserts in last 60m + last updated (when a timestamp column exists).
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [snapshot, liveCounts, activity] = await Promise.all([
    readInventorySnapshot().catch(() => null),
    readLiveTableCounts().catch(() => ({}) as Record<string, number>),
    readAllTableActivity().catch(() => ({})),
  ])

  return NextResponse.json({
    snapshot,
    liveCounts,
    activity,
    at: new Date().toISOString(),
  })
}
