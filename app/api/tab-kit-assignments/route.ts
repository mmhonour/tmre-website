import { NextResponse } from 'next/server'
import { readTabKitAssignmentsFresh } from '@/lib/tab-kit-assignments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public read of role → kit remaps (no secrets). Admin writes via /api/admin/tab-kit-assignments. */
export async function GET() {
  const assignments = await readTabKitAssignmentsFresh()
  return NextResponse.json(
    { assignments },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
