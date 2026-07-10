import { NextRequest, NextResponse } from 'next/server'
import {
  SITE_PASSWORD_COOKIE,
  sitePasswordMatches,
} from '@/lib/site-password'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/** Unlock password-gated pages (Admin today; more later). */
export async function POST(req: NextRequest) {
  let password = ''
  try {
    const body = (await req.json()) as { password?: string }
    password = body.password?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!sitePasswordMatches(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SITE_PASSWORD_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

/** Clear the site-password cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SITE_PASSWORD_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
