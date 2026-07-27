import { NextResponse } from 'next/server'
import { isAdminAuthorizedFromCookies } from '@/lib/admin-auth'
import { readListingsRefreshStatus } from '@/lib/listings-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const status = readListingsRefreshStatus()
  const isAdmin = await isAdminAuthorizedFromCookies()

  // Public clients only get live/synced timing; admin also gets refresh kind.
  const body = isAdmin
    ? status
    : {
        refreshing: status.refreshing,
        lastFinishedAt: status.lastFinishedAt,
      }

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
