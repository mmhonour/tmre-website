import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { isValidEmail } from '@/lib/contact-notify-config'
import {
  getMarketDigestConfigFresh,
  setMarketDigestEmail,
  setMarketDigestEnabled,
} from '@/lib/market-digest-config'
import { sendMarketDigestEmail } from '@/lib/market-digest-notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return getMarketDigestConfigFresh()
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

  const o = body as { email?: unknown; enabled?: unknown }
  try {
    if (typeof o.email === 'string') {
      if (!isValidEmail(o.email)) {
        return NextResponse.json(
          { error: 'A valid email address is required' },
          { status: 400 },
        )
      }
      await setMarketDigestEmail(o.email)
    }
    if (typeof o.enabled === 'boolean') {
      await setMarketDigestEnabled(o.enabled)
    }
    return NextResponse.json({ ok: true, ...(await payload()) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}

/** Force-send a test digest (does not update the weekly watermark). */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendMarketDigestEmail({ force: true })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason ?? 'Send failed', ...result },
        { status: 503 },
      )
    }
    return NextResponse.json({ ...(await payload()), ...result, ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 502 },
    )
  }
}
