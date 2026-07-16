import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readInventorySnapshot } from '@/lib/db/listings-repo'
import { describePostgresDatabase } from '@/lib/postgres-schema-diagram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lightweight feed for the admin "Inventory comparison" panel so it can refresh
// on its own ~30-minute cycle without reloading the whole (read-heavy) admin
// page. Returns the post-full-resync snapshot counts plus the current live
// per-table row counts from Neon Postgres.
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [snapshot, diagram] = await Promise.all([
    readInventorySnapshot().catch(() => null),
    describePostgresDatabase().catch(() => null),
  ])

  const liveCounts: Record<string, number> = {}
  for (const table of diagram?.tables ?? []) {
    liveCounts[table.name] = table.rowCount
  }

  return NextResponse.json({
    snapshot,
    liveCounts,
    at: new Date().toISOString(),
  })
}
