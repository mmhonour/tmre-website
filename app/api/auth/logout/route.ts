import { NextRequest, NextResponse } from 'next/server'
import {
  destroySession,
  SITE_USER_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/site-user-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SITE_USER_SESSION_COOKIE)?.value
  await destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SITE_USER_SESSION_COOKIE, '', {
    ...sessionCookieOptions(0),
    maxAge: 0,
  })
  return res
}
