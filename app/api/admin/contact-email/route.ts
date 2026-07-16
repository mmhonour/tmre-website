import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_CONTACT_NOTIFY_EMAIL,
  getContactNotifyEmailFresh,
  isValidEmail,
  setContactNotifyEmail,
} from '@/lib/contact-notify-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return {
    email: await getContactNotifyEmailFresh(),
    default: DEFAULT_CONTACT_NOTIFY_EMAIL,
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

  const raw = (body as { email?: unknown })?.email
  if (typeof raw !== 'string' || !isValidEmail(raw)) {
    return NextResponse.json(
      { error: 'A valid email address is required' },
      { status: 400 },
    )
  }

  const applied = await setContactNotifyEmail(raw)
  return NextResponse.json({ ok: true, ...(await payload()), email: applied })
}
