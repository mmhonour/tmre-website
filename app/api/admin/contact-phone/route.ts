import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_CONTACT_PHONE_DIGITS,
  getContactPhoneFresh,
  isValidPhone,
  setContactPhone,
} from '@/lib/phone-config'
import { formatPhoneDisplay } from '@/lib/business-info'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const { tel, display } = await getContactPhoneFresh()
  return {
    phone: tel,
    display,
    default: DEFAULT_CONTACT_PHONE_DIGITS,
    defaultDisplay: formatPhoneDisplay(DEFAULT_CONTACT_PHONE_DIGITS),
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

  const raw = (body as { phone?: unknown })?.phone
  if (typeof raw !== 'string' || !isValidPhone(raw)) {
    return NextResponse.json(
      { error: 'A valid 10-digit US phone number is required' },
      { status: 400 },
    )
  }

  const applied = await setContactPhone(raw)
  return NextResponse.json({
    ok: true,
    ...(await payload()),
    phone: applied,
    display: formatPhoneDisplay(applied),
  })
}
