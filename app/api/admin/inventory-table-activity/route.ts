import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readAllTableActivity } from '@/lib/db/inventory-table-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight feed for Admin → Database → Inventory last-updated / 60m upserts.
 * Separate from inventory-snapshot so COUNT(*) over every table cannot blank activity.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const activity = await readAllTableActivity()
    return NextResponse.json({
      activity,
      at: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to load table activity',
      },
      { status: 500 },
    )
  }
}
