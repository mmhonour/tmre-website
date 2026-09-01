import 'server-only'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { SITE_URL } from '@/lib/business-info'
import { isValidEmail } from '@/lib/contact-notify-config'
import { query, queryOne } from '@/lib/db/postgres'
import { resendFrom } from '@/lib/resend-from'

export const SITE_USER_SESSION_COOKIE = 'tmre_user_session'

const MAGIC_LINK_TTL_MS = 30 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RESEND_TIMEOUT_MS = 10_000

export type SiteUser = {
  id: string
  email: string
  name: string | null
  visitorId: string | null
  createdAt: string
  lastLoginAt: string | null
}

let ensured = false

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function tsToIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

export async function ensureSiteUserTables(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS site_users (
      id              text PRIMARY KEY,
      email           text NOT NULL UNIQUE,
      name            text,
      visitor_id      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      last_login_at   timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_site_users_visitor_id
      ON site_users (visitor_id)
      WHERE visitor_id IS NOT NULL
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS site_user_magic_links (
      token_hash      text PRIMARY KEY,
      user_id         text NOT NULL REFERENCES site_users (id) ON DELETE CASCADE,
      expires_at      timestamptz NOT NULL,
      used_at         timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS site_user_sessions (
      id              text PRIMARY KEY,
      user_id         text NOT NULL REFERENCES site_users (id) ON DELETE CASCADE,
      token_hash      text NOT NULL UNIQUE,
      expires_at      timestamptz NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      last_seen_at    timestamptz NOT NULL DEFAULT now()
    )
  `)
  ensured = true
}

type UserRow = {
  id: string
  email: string
  name: string | null
  visitor_id: string | null
  created_at: Date | string
  last_login_at: Date | string | null
}

function mapUser(row: UserRow): SiteUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    visitorId: row.visitor_id,
    createdAt: tsToIso(row.created_at) ?? new Date().toISOString(),
    lastLoginAt: tsToIso(row.last_login_at),
  }
}

export async function upsertSiteUserByEmail(input: {
  email: string
  name?: string | null
  visitorId?: string | null
}): Promise<SiteUser> {
  await ensureSiteUserTables()
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) throw new Error('Valid email required')
  const name = input.name?.trim() || null
  const visitorId = input.visitorId?.trim() || null

  const existing = await queryOne<UserRow>(
    `SELECT id, email, name, visitor_id, created_at, last_login_at
       FROM site_users WHERE email = $1`,
    [email],
  )
  if (existing) {
    await query(
      `UPDATE site_users SET
         name = COALESCE($2, name),
         visitor_id = COALESCE($3, visitor_id),
         updated_at = now()
       WHERE id = $1`,
      [existing.id, name, visitorId],
    )
    const refreshed = await queryOne<UserRow>(
      `SELECT id, email, name, visitor_id, created_at, last_login_at
         FROM site_users WHERE id = $1`,
      [existing.id],
    )
    return mapUser(refreshed ?? existing)
  }

  const id = randomUUID()
  await query(
    `INSERT INTO site_users (id, email, name, visitor_id)
     VALUES ($1, $2, $3, $4)`,
    [id, email, name, visitorId],
  )
  return {
    id,
    email,
    name,
    visitorId,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  }
}

export async function readSiteUserById(id: string): Promise<SiteUser | null> {
  await ensureSiteUserTables()
  const row = await queryOne<UserRow>(
    `SELECT id, email, name, visitor_id, created_at, last_login_at
       FROM site_users WHERE id = $1`,
    [id.trim()],
  )
  return row ? mapUser(row) : null
}

async function sendMagicLinkEmail(opts: {
  to: string
  verifyUrl: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[site-user-auth] RESEND_API_KEY not set; magic link not sent')
    return false
  }
  const from = resendFrom('TMRE')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: 'Your TMRE sign-in link',
        text: [
          'Sign in to TMRE (no password — this link is your login):',
          '',
          opts.verifyUrl,
          '',
          'This link expires in 30 minutes. If you did not ask for it, ignore this email.',
          '',
          '— TMRE',
        ].join('\n'),
      }),
      signal: controller.signal,
    })
    return res.ok
  } catch (err) {
    console.warn('[site-user-auth] magic link email failed', err)
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function requestMagicLink(opts: {
  email: string
  name?: string | null
  visitorId?: string | null
  nextPath?: string | null
}): Promise<{ ok: boolean; emailed: boolean; userId: string }> {
  const user = await upsertSiteUserByEmail({
    email: opts.email,
    name: opts.name,
    visitorId: opts.visitorId,
  })
  const raw = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(raw)
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString()
  await query(
    `INSERT INTO site_user_magic_links (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3::timestamptz)`,
    [tokenHash, user.id, expiresAt],
  )
  const next =
    opts.nextPath?.startsWith('/') && !opts.nextPath.startsWith('//')
      ? opts.nextPath
      : '/'
  const verifyUrl = `${SITE_URL}/api/auth/verify?token=${encodeURIComponent(raw)}&next=${encodeURIComponent(next)}`
  const emailed = await sendMagicLinkEmail({ to: user.email, verifyUrl })
  return { ok: true, emailed, userId: user.id }
}

export async function consumeMagicLinkAndCreateSession(
  rawToken: string,
): Promise<{ user: SiteUser; sessionToken: string } | null> {
  await ensureSiteUserTables()
  const tokenHash = hashToken(rawToken.trim())
  const link = await queryOne<{
    user_id: string
    expires_at: Date | string
    used_at: Date | string | null
  }>(
    `SELECT user_id, expires_at, used_at
       FROM site_user_magic_links
      WHERE token_hash = $1`,
    [tokenHash],
  )
  if (!link || link.used_at) return null
  const expiresMs = Date.parse(
    link.expires_at instanceof Date
      ? link.expires_at.toISOString()
      : String(link.expires_at),
  )
  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) return null

  await query(
    `UPDATE site_user_magic_links SET used_at = now() WHERE token_hash = $1`,
    [tokenHash],
  )

  const sessionToken = randomBytes(32).toString('base64url')
  const sessionId = randomUUID()
  const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await query(
    `INSERT INTO site_user_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4::timestamptz)`,
    [sessionId, link.user_id, hashToken(sessionToken), sessionExpires],
  )
  await query(
    `UPDATE site_users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
    [link.user_id],
  )
  const user = await readSiteUserById(link.user_id)
  if (!user) return null
  return { user, sessionToken }
}

export async function readSessionUser(
  sessionToken: string | null | undefined,
): Promise<SiteUser | null> {
  const raw = sessionToken?.trim()
  if (!raw) return null
  await ensureSiteUserTables()
  const row = await queryOne<UserRow & { session_expires: Date | string }>(
    `SELECT u.id, u.email, u.name, u.visitor_id, u.created_at, u.last_login_at,
            s.expires_at AS session_expires
       FROM site_user_sessions s
       JOIN site_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()`,
    [hashToken(raw)],
  )
  if (!row) return null
  void query(
    `UPDATE site_user_sessions SET last_seen_at = now() WHERE token_hash = $1`,
    [hashToken(raw)],
  ).catch(() => {})
  return mapUser(row)
}

export async function destroySession(
  sessionToken: string | null | undefined,
): Promise<void> {
  const raw = sessionToken?.trim()
  if (!raw) return
  await ensureSiteUserTables()
  await query(`DELETE FROM site_user_sessions WHERE token_hash = $1`, [
    hashToken(raw),
  ])
}

export async function getSessionUserFromCookies(): Promise<SiteUser | null> {
  const jar = await cookies()
  return readSessionUser(jar.get(SITE_USER_SESSION_COOKIE)?.value)
}

export function sessionCookieOptions(maxAgeSec = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(maxAgeSec),
  }
}
