import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_SITE_NAV,
  getSiteNavFresh,
  setSiteNav,
} from '@/lib/site-nav-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const config = await getSiteNavFresh()
  return {
    config,
    default: DEFAULT_SITE_NAV,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw =
    body && typeof body === 'object' && 'config' in body
      ? (body as { config: unknown }).config
      : body

  const config = await setSiteNav(raw)
  return NextResponse.json({
    ok: true,
    config,
    default: DEFAULT_SITE_NAV,
  })
}
