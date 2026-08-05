import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  isFredConfigured,
  syncMortgageRatesFromFred,
} from '@/lib/mortgage-rates-sync'
import { readMortgageRateCounts } from '@/lib/db/mortgage-rates-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Admin "Refresh rates" — pulls every FRED series into Neon now. */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isFredConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'FRED_API_KEY is not set on this environment',
      },
      { status: 400 },
    )
  }

  const result = await syncMortgageRatesFromFred()
  const counts = await readMortgageRateCounts().catch(() => [])
  return NextResponse.json(
    { ...result, counts },
    { status: result.ok ? 200 : 502 },
  )
}
