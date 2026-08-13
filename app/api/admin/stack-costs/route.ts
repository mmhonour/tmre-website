import { NextResponse } from 'next/server'
import { loadStackCostRollup } from '@/lib/stack-cost-rollup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rollup = await loadStackCostRollup()
    return NextResponse.json(rollup)
  } catch (err) {
    console.error('[/api/admin/stack-costs] error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load stack costs' },
      { status: 500 },
    )
  }
}
