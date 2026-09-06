import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { loadDbSizeReport } from '@/lib/db-size-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 26

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await loadDbSizeReport()
    return NextResponse.json(report)
  } catch (err) {
    console.error('[/api/admin/db-size] error', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to load size report',
      },
      { status: 500 },
    )
  }
}
