import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getRetsCredentialsForAdmin,
  setRetsCredentials,
} from '@/lib/rets-credentials'
import { probeRetsConnection } from '@/lib/rets-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const credentials = getRetsCredentialsForAdmin()
  const probe = req.nextUrl.searchParams.get('probe') === '1'

  let health = null
  if (probe) {
    try {
      health = await probeRetsConnection(true)
    } catch (err) {
      console.warn('[/api/admin/rets-credentials] RETS probe failed', err)
      health = {
        configured: false,
        status: 'error',
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      }
    }
  }

  return NextResponse.json({ credentials, health })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { serverUrl?: string; username?: string; password?: string }
  try {
    body = (await req.json()) as { serverUrl?: string; username?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const serverUrl = body.serverUrl?.trim() ?? ''
  const username = body.username?.trim() ?? ''
  const password = body.password?.trim() ?? ''

  if (!serverUrl || !username || !password) {
    return NextResponse.json(
      { error: 'serverUrl, username, and password are required' },
      { status: 400 },
    )
  }

  try {
    const credentials = setRetsCredentials({ serverUrl, username, password })
    const health = await probeRetsConnection(true)
    return NextResponse.json({ credentials, health })
  } catch (err) {
    console.error('[/api/admin/rets-credentials]', err)
    return NextResponse.json(
      {
        error: 'Failed to save RETS credentials',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }
}
