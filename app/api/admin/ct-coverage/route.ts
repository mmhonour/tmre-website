import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  listCtCoverageByCounty,
  setCtTownActive,
} from '@/lib/ct-coverage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const counties = await listCtCoverageByCounty()
    const activeTowns = counties.flatMap((c) =>
      c.towns.filter((t) => t.active).map((t) => t.name),
    )
    return NextResponse.json({
      counties,
      activeTowns,
      activeCount: activeTowns.length,
      townCount: counties.reduce((sum, c) => sum + c.townCount, 0),
      note:
        'Public copy, town pills, Market Pulse, and the footer list follow these Active towns. RETS incremental still uses the compile-time TMRE_TOWNS set until Phase 3.',
    })
  } catch (err) {
    console.error('[/api/admin/ct-coverage] GET', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load CT coverage (run npm run db:migrate?)',
      },
      { status: 500 },
    )
  }
}

/**
 * PATCH body: { townId: string, active: boolean }
 */
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body as { townId?: unknown; active?: unknown }
  if (typeof raw.townId !== 'string' || typeof raw.active !== 'boolean') {
    return NextResponse.json(
      { error: 'Provide { townId, active }' },
      { status: 400 },
    )
  }

  try {
    const town = await setCtTownActive(raw.townId, raw.active)
    if (!town) {
      return NextResponse.json({ error: 'Unknown townId' }, { status: 404 })
    }
    const counties = await listCtCoverageByCounty()
    return NextResponse.json({
      ok: true,
      town,
      counties,
      note: 'Saved — public lists and copy update on the next page load. RETS pulls are unchanged.',
    })
  } catch (err) {
    console.error('[/api/admin/ct-coverage] PATCH', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 },
    )
  }
}
