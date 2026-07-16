import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_PHONE_DIGITS,
  formatPhoneDisplay,
  normalizePhoneDigits,
} from '@/lib/business-info'

// ---------------------------------------------------------------------------
// Admin-defined public phone number, shown wherever the phone CTA appears.
//
// Stored in sync_meta (raw 10 digits) so it can be changed from /admin with no
// redeploy and survives deploys. Resolution order:
//   1. admin-defined value in sync_meta (this module)
//   2. CONTACT_PHONE env var (legacy / infra fallback)
//   3. hard-coded default in business-info (DEFAULT_PHONE_DIGITS)
// ---------------------------------------------------------------------------

export const CONTACT_PHONE_KEY = 'contact_phone'
export const DEFAULT_CONTACT_PHONE_DIGITS = DEFAULT_PHONE_DIGITS

export type ContactPhone = {
  /** Raw 10-digit string, for tel: links. */
  tel: string
  /** Pretty "(XXX) XXX-XXXX" form, for display. */
  display: string
}

/** True when the input reduces to a valid US 10-digit number. */
export function isValidPhone(value: string): boolean {
  return normalizePhoneDigits(value).length === 10
}

function envFallback(): string {
  const fromEnv = normalizePhoneDigits(process.env.CONTACT_PHONE ?? '')
  return fromEnv.length === 10 ? fromEnv : DEFAULT_CONTACT_PHONE_DIGITS
}

/** Configured phone as raw digits (synchronous, from the hydrated cache). */
export function getContactPhoneDigits(): string {
  const raw = getSyncMeta(CONTACT_PHONE_KEY)
  if (raw) {
    const digits = normalizePhoneDigits(raw)
    if (digits.length === 10) return digits
  }
  return envFallback()
}

/** Configured phone as { tel, display } (synchronous). Use for SSR render. */
export function getContactPhone(): ContactPhone {
  const tel = getContactPhoneDigits()
  return { tel, display: formatPhoneDisplay(tel) }
}

/** Authoritative read straight from Postgres; falls back to cache/env. */
export async function getContactPhoneFresh(): Promise<ContactPhone> {
  try {
    const raw = await getSyncMetaFresh(CONTACT_PHONE_KEY)
    if (raw) {
      const digits = normalizePhoneDigits(raw)
      if (digits.length === 10) return { tel: digits, display: formatPhoneDisplay(digits) }
    }
  } catch {
    // fall through to cache/env
  }
  return getContactPhone()
}

/** Persist a new phone (durable); returns the normalized 10-digit value stored. */
export async function setContactPhone(value: string): Promise<string> {
  const digits = normalizePhoneDigits(value)
  if (digits.length !== 10) {
    throw new Error('A valid 10-digit US phone number is required')
  }
  await setSyncMetaDurable(CONTACT_PHONE_KEY, digits)
  return digits
}
