import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getTownBudgetSourcesFresh,
  setTownBudgetSources,
} from '@/lib/town-budget-sources-config'
import { DEFAULT_TOWN_BUDGET_SOURCES } from '@/lib/town-budget-sources-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return {
    ...(await getTownBudgetSourcesFresh()),
    default: DEFAULT_TOWN_BUDGET_SOURCES,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
}

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

  try {
    const applied = await setTownBudgetSources(body)
    return NextResponse.json({
      ok: true,
      ...applied,
      default: DEFAULT_TOWN_BUDGET_SOURCES,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
