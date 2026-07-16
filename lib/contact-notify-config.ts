import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'

// ---------------------------------------------------------------------------
// Admin-defined destination for every contact/lead form on the site.
//
// Stored in sync_meta so it can be changed from /admin with no redeploy and
// survives deploys. Resolution order for the "to" address:
//   1. admin-defined value in sync_meta (this module)
//   2. CONTACT_NOTIFY_EMAIL env var (legacy / infra fallback)
//   3. hard-coded default below
// ---------------------------------------------------------------------------

export const CONTACT_NOTIFY_EMAIL_KEY = 'contact_notify_email'
export const DEFAULT_CONTACT_NOTIFY_EMAIL = 'tmarks@bhhsne.com'

/** Loose but practical email shape check. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

function envFallback(): string {
  return process.env.CONTACT_NOTIFY_EMAIL?.trim() || DEFAULT_CONTACT_NOTIFY_EMAIL
}

/**
 * Configured notify email (synchronous, from the hydrated sync_meta cache).
 * Correct inside the Next server. Use for admin page initial render.
 */
export function getContactNotifyEmail(): string {
  const raw = getSyncMeta(CONTACT_NOTIFY_EMAIL_KEY)
  if (raw && isValidEmail(raw)) return raw.trim()
  return envFallback()
}

/**
 * Authoritative read straight from Postgres. Safe in any process (e.g. a POST
 * route whose per-invocation process may not have hydrated the cache). Falls
 * back to the cache / env on any failure.
 */
export async function getContactNotifyEmailFresh(): Promise<string> {
  try {
    const raw = await getSyncMetaFresh(CONTACT_NOTIFY_EMAIL_KEY)
    if (raw && isValidEmail(raw)) return raw.trim()
  } catch {
    // fall through to cache/env
  }
  return getContactNotifyEmail()
}

/** Persist a new notify email (durable) and return the trimmed value applied. */
export async function setContactNotifyEmail(value: string): Promise<string> {
  const trimmed = value.trim()
  if (!isValidEmail(trimmed)) {
    throw new Error('Invalid email address')
  }
  await setSyncMetaDurable(CONTACT_NOTIFY_EMAIL_KEY, trimmed)
  return trimmed
}
