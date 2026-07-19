import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_BROKERAGE_NAME,
  getBrokerageNameFresh,
  isValidBrokerageName,
  setBrokerageName,
} from '@/lib/brokerage-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const name = await getBrokerageNameFresh()
  return {
    name,
    default: DEFAULT_BROKERAGE_NAME,
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

  const raw = (body as { name?: unknown })?.name
  if (typeof raw !== 'string' || !isValidBrokerageName(raw)) {
    return NextResponse.json(
      { error: 'Brokerage name must be 2–120 characters' },
      { status: 400 },
    )
  }

  const applied = await setBrokerageName(raw)
  return NextResponse.json({
    ok: true,
    ...(await payload()),
    name: applied,
  })
}
