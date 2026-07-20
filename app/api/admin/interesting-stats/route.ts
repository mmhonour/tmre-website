import { NextResponse, type NextRequest } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readInterestingStatAdminView } from '@/lib/interesting-stat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const view = await readInterestingStatAdminView()
    return NextResponse.json(view)
  } catch (err) {
    console.error('[/api/admin/interesting-stats] error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load interesting stats' },
      { status: 500 },
    )
  }
}
