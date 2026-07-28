import { NextRequest, NextResponse } from 'next/server'
import {
  consumeMagicLinkAndCreateSession,
  SITE_USER_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/site-user-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim() || ''
  const nextRaw = req.nextUrl.searchParams.get('next')?.trim() || '/'
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/'

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing', req.url))
  }

  try {
    const result = await consumeMagicLinkAndCreateSession(token)
    if (!result) {
      return NextResponse.redirect(new URL('/login?error=expired', req.url))
    }
    const res = NextResponse.redirect(new URL(next, req.url))
    res.cookies.set(
      SITE_USER_SESSION_COOKIE,
      result.sessionToken,
      sessionCookieOptions(),
    )
    return res
  } catch (err) {
    console.error('[/api/auth/verify]', err)
    return NextResponse.redirect(new URL('/login?error=failed', req.url))
  }
}
