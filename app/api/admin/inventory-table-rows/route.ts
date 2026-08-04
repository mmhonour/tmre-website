import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readTableSampleRows } from '@/lib/db/inventory-table-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * On-demand sample rows for Admin → Database → Inventory table expand (+/−).
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const table = req.nextUrl.searchParams.get('table')?.trim() || ''
  if (!table) {
    return NextResponse.json({ error: 'table is required' }, { status: 400 })
  }

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '100')
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100

  try {
    const sample = await readTableSampleRows(table, limit)
    return NextResponse.json({ sample, at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load rows'
    const status = /unknown public table|invalid/i.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
