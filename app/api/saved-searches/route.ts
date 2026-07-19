import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  createSavedSearchAlert,
  isValidTimeEt,
  type AlertCadence,
  type AlertChannel,
} from '@/lib/saved-search-alerts'
import { isValidEmail } from '@/lib/contact-notify-config'
import type { VisitorSearchCriteria } from '@/lib/visitor-search-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VISITOR_COOKIE = 'tmre_vid'

function isCriteria(value: unknown): value is VisitorSearchCriteria {
  if (!value || typeof value !== 'object') return false
  const c = value as VisitorSearchCriteria
  return typeof c.source === 'string'
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body as {
    criteria?: unknown
    channel?: unknown
    email?: unknown
    phone?: unknown
    cadence?: unknown
    dailyTimeEt?: unknown
    weeklyDay?: unknown
    weeklyTimeEt?: unknown
  }

  if (!isCriteria(raw.criteria)) {
    return NextResponse.json({ error: 'Search criteria are required' }, { status: 400 })
  }

  const channel = raw.channel === 'sms' ? 'sms' : 'email'
  const cadence = (
    raw.cadence === 'daily' || raw.cadence === 'weekly' || raw.cadence === 'immediate'
      ? raw.cadence
      : null
  ) as AlertCadence | null
  if (!cadence) {
    return NextResponse.json(
      { error: 'Cadence must be immediate, daily, or weekly' },
      { status: 400 },
    )
  }

  if (channel === 'sms') {
    return NextResponse.json(
      {
        error:
          'Text alerts are not available yet. Choose email — SMS is planned (Twilio + A2P).',
        smsAvailable: false,
      },
      { status: 400 },
    )
  }

  const email = typeof raw.email === 'string' ? raw.email.trim() : ''
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  if (cadence === 'daily') {
    const t = typeof raw.dailyTimeEt === 'string' ? raw.dailyTimeEt : ''
    if (!isValidTimeEt(t)) {
      return NextResponse.json(
        { error: 'Daily alerts need a time (HH:MM Eastern)' },
        { status: 400 },
      )
    }
  }
  if (cadence === 'weekly') {
    const day = typeof raw.weeklyDay === 'number' ? raw.weeklyDay : Number(raw.weeklyDay)
    const t = typeof raw.weeklyTimeEt === 'string' ? raw.weeklyTimeEt : ''
    if (!Number.isInteger(day) || day < 0 || day > 6 || !isValidTimeEt(t)) {
      return NextResponse.json(
        { error: 'Weekly alerts need a weekday (0–6) and time (HH:MM Eastern)' },
        { status: 400 },
      )
    }
  }

  const jar = await cookies()
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null

  try {
    const alert = await createSavedSearchAlert({
      visitorId,
      criteria: raw.criteria,
      channel: channel as AlertChannel,
      email,
      phone: typeof raw.phone === 'string' ? raw.phone : null,
      cadence,
      dailyTimeEt: typeof raw.dailyTimeEt === 'string' ? raw.dailyTimeEt : null,
      weeklyDay:
        typeof raw.weeklyDay === 'number'
          ? raw.weeklyDay
          : raw.weeklyDay != null
            ? Number(raw.weeklyDay)
            : null,
      weeklyTimeEt: typeof raw.weeklyTimeEt === 'string' ? raw.weeklyTimeEt : null,
    })
    return NextResponse.json({ ok: true, alert })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save alert'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
