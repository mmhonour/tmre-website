import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  loadDbSizeReport,
  persistDbSizeReport,
  readStoredDbSizeReport,
} from '@/lib/db-size-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 26

/** Latest snapshot written by the 6am job or the last Run again. Does not recompute. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await readStoredDbSizeReport()
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[/api/admin/db-size] GET error', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to load size report',
      },
      { status: 500 },
    )
  }
}

/** Ad-hoc recompute. Overwrites the same snapshot the daily job writes. */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await loadDbSizeReport({ trigger: 'adhoc' })
    await persistDbSizeReport(report)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[/api/admin/db-size] POST error', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to run size report',
      },
      { status: 500 },
    )
  }
}
