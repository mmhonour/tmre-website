import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  cookiePurpose,
  isKnownHttpOnlyCookie,
  previewCookieValue,
  SITE_VISITOR_COOKIE,
} from '@/lib/browser-cookies-catalog'
import { SITE_PASSWORD_COOKIE } from '@/lib/site-password'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTTPONLY_NAMES = new Set([SITE_PASSWORD_COOKIE, SITE_VISITOR_COOKIE])

type CookieRow = {
  name: string
  purpose: string
  httpOnly: boolean
  /** Redacted for auth; preview for others. */
  preview: string
  present: boolean
}

function clearCookieOnResponse(
  res: NextResponse,
  name: string,
  httpOnly: boolean,
) {
  res.cookies.set(name, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    httpOnly,
    ...(process.env.NODE_ENV === 'production' ? { secure: true } : {}),
  })
}

/**
 * GET — cookies on this request (includes HttpOnly the browser cannot show).
 * DELETE — clear named cookies (or all known + request cookies) for this browser.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows: CookieRow[] = []
  const seen = new Set<string>()

  for (const c of req.cookies.getAll()) {
    seen.add(c.name)
    const httpOnly = isKnownHttpOnlyCookie(c.name)
    const isAuth = c.name === SITE_PASSWORD_COOKIE
    rows.push({
      name: c.name,
      purpose: cookiePurpose(c.name),
      httpOnly,
      preview: isAuth
        ? c.value === '1'
          ? '(set)'
          : '(set, unexpected value)'
        : previewCookieValue(c.value),
      present: true,
    })
  }

  // Always surface known HttpOnly cookies even when absent.
  for (const name of HTTPONLY_NAMES) {
    if (seen.has(name)) continue
    rows.push({
      name,
      purpose: cookiePurpose(name),
      httpOnly: true,
      preview: '(not set)',
      present: false,
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    cookies: rows,
    note:
      'HttpOnly cookies are only visible via this API. Path/domain are not exposed by document.cookie.',
  })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { names?: string[]; all?: boolean } = {}
  try {
    body = (await req.json()) as { names?: string[]; all?: boolean }
  } catch {
    body = {}
  }

  const toClear = new Set<string>()
  if (body.all) {
    for (const c of req.cookies.getAll()) toClear.add(c.name)
    for (const name of HTTPONLY_NAMES) toClear.add(name)
  } else if (Array.isArray(body.names)) {
    for (const n of body.names) {
      if (typeof n === 'string' && n.trim()) toClear.add(n.trim())
    }
  }

  if (toClear.size === 0) {
    return NextResponse.json(
      { error: 'Provide names[] or all: true' },
      { status: 400 },
    )
  }

  const cleared = [...toClear].sort((a, b) => a.localeCompare(b))
  const loggedOut = cleared.includes(SITE_PASSWORD_COOKIE)
  const res = NextResponse.json({ ok: true, cleared, loggedOut })

  for (const name of cleared) {
    const httpOnly = isKnownHttpOnlyCookie(name) || HTTPONLY_NAMES.has(name)
    clearCookieOnResponse(res, name, httpOnly)
    // Also clear a non-HttpOnly twin in case the cookie was set without HttpOnly.
    if (httpOnly) clearCookieOnResponse(res, name, false)
  }

  return res
}
