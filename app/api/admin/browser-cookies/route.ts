import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  cookieLocationFromCatalog,
  cookiePurpose,
  isKnownHttpOnlyCookie,
  previewCookieValue,
  SITE_VISITOR_COOKIE,
  type CookieLocationInfo,
} from '@/lib/browser-cookies-catalog'
import { SITE_PASSWORD_COOKIE } from '@/lib/site-password'
import { SITE_USER_SESSION_COOKIE } from '@/lib/site-user-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTTPONLY_NAMES = new Set([
  SITE_PASSWORD_COOKIE,
  SITE_VISITOR_COOKIE,
  SITE_USER_SESSION_COOKIE,
])

type CookieRow = {
  name: string
  purpose: string
  httpOnly: boolean
  /** Redacted for auth; full value for others (Admin-only). */
  value: string | null
  /** Short preview always safe to render. */
  preview: string
  present: boolean
  location: CookieLocationInfo
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

function locationForKnown(name: string, secureHint: boolean | null): CookieLocationInfo {
  const base = cookieLocationFromCatalog(name)
  return {
    ...base,
    secure:
      secureHint ??
      (isKnownHttpOnlyCookie(name)
        ? process.env.NODE_ENV === 'production'
        : base.secure),
  }
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
  const host = req.nextUrl.hostname

  for (const c of req.cookies.getAll()) {
    seen.add(c.name)
    const httpOnly = isKnownHttpOnlyCookie(c.name)
    const isAuth = c.name === SITE_PASSWORD_COOKIE
    const location = locationForKnown(c.name, httpOnly ? process.env.NODE_ENV === 'production' : null)
    if (!location.domain) location.domain = host

    rows.push({
      name: c.name,
      purpose: cookiePurpose(c.name),
      httpOnly,
      value: isAuth ? null : c.value,
      preview: isAuth
        ? c.value === '1'
          ? '(set — value redacted)'
          : '(set, unexpected value — redacted)'
        : previewCookieValue(c.value),
      present: true,
      location,
    })
  }

  // Always surface known HttpOnly cookies even when absent.
  for (const name of HTTPONLY_NAMES) {
    if (seen.has(name)) continue
    const location = locationForKnown(name, process.env.NODE_ENV === 'production')
    if (!location.domain) location.domain = host
    rows.push({
      name,
      purpose: cookiePurpose(name),
      httpOnly: true,
      value: null,
      preview: '(not set)',
      present: false,
      location,
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    cookies: rows,
    note:
      'Location shows Path / host / SameSite (from catalog or Cookie Store). Admin → Cookies “Show catalog” lists every known purpose from lib/browser-cookies-catalog.ts; Show values reveals contents (unlock stays redacted). Pref cookies last ~1 year via lib/client-prefs.ts.',
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
