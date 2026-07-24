import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getDeployNotifyConfigFresh,
  setDeployNotifyConfig,
} from '@/lib/deploy-notify-config'
import { sendDeployNotify } from '@/lib/deploy-notify'
import { SITE_URL } from '@/lib/business-info'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await getDeployNotifyConfigFresh())
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

  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  try {
    const applied = await setDeployNotifyConfig({
      enabled: typeof o.enabled === 'boolean' ? o.enabled : undefined,
      emailEnabled: typeof o.emailEnabled === 'boolean' ? o.emailEnabled : undefined,
      smsEnabled: typeof o.smsEnabled === 'boolean' ? o.smsEnabled : undefined,
      email: typeof o.email === 'string' ? o.email : undefined,
      phone: typeof o.phone === 'string' ? o.phone : undefined,
    })
    return NextResponse.json({ ok: true, ...applied })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}

/** Admin "Send test" — forces a ready/main notification. */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDeployNotify({
      force: true,
      event: {
        state: 'ready',
        branch: 'main',
        context: 'production',
        title: 'Admin test notification',
        commitRef: null,
        deployUrl: SITE_URL,
        adminUrl: null,
        errorMessage: null,
        name: 'tmre-website',
      },
    })
    const config = await getDeployNotifyConfigFresh()
    return NextResponse.json(
      { ...result, ...config },
      { status: result.ok || result.skipped ? 200 : 502 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Send failed' },
      { status: 500 },
    )
  }
}
