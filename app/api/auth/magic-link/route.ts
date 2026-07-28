import { NextRequest, NextResponse } from 'next/server'
import { SITE_VISITOR_COOKIE } from '@/lib/browser-cookies-catalog'
import { isValidEmail } from '@/lib/contact-notify-config'
import { requestMagicLink } from '@/lib/site-user-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const nextPath = typeof body.next === 'string' ? body.next.trim() : '/'

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Enter a valid email address' },
      { status: 400 },
    )
  }

  const visitorId = req.cookies.get(SITE_VISITOR_COOKIE)?.value?.trim() || null

  try {
    const result = await requestMagicLink({
      email,
      name: name || null,
      visitorId,
      nextPath,
    })
    if (visitorId) {
      const { attachProfileFieldsToVisitor } = await import(
        '@/lib/db/visitors-repo'
      )
      await attachProfileFieldsToVisitor(visitorId, {
        email,
        name: name || null,
      })
    }
    return NextResponse.json({
      ok: true,
      emailed: result.emailed,
      message: result.emailed
        ? 'Check your email for a sign-in link (no password).'
        : 'Account ready — email delivery is not configured on this environment.',
    })
  } catch (err) {
    console.error('[/api/auth/magic-link]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not send link' },
      { status: 500 },
    )
  }
}
