import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getSocialProfilesFresh,
  setSocialProfiles,
} from '@/lib/social-profiles-config'
import { DEFAULT_SOCIAL_PROFILES } from '@/lib/social-profiles-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return {
    ...(await getSocialProfilesFresh()),
    default: DEFAULT_SOCIAL_PROFILES,
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
    const applied = await setSocialProfiles(body)
    return NextResponse.json({ ok: true, ...applied, default: DEFAULT_SOCIAL_PROFILES })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}
