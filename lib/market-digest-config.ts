import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_CONTACT_NOTIFY_EMAIL,
  getContactNotifyEmail,
  getContactNotifyEmailFresh,
  isValidEmail,
} from '@/lib/contact-notify-config'
import type { MarketDigestConfig } from '@/lib/market-digest-shared'

export type { MarketDigestConfig } from '@/lib/market-digest-shared'

export const MARKET_DIGEST_EMAIL_KEY = 'market_digest_email'
export const MARKET_DIGEST_ENABLED_KEY = 'market_digest_enabled'
export const MARKET_DIGEST_LAST_SENT_KEY = 'market_digest_last_sent_at'
export const MARKET_DIGEST_LAST_WEEK_KEY = 'market_digest_last_week_key'

function parseEnabled(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

function resolveEmail(raw: string | null | undefined, fallback: string): string {
  if (raw && isValidEmail(raw)) return raw.trim()
  return fallback
}

/** Cached config for hydrated Next server. */
export function getMarketDigestConfig(): MarketDigestConfig {
  const fallback = getContactNotifyEmail()
  return {
    email: resolveEmail(getSyncMeta(MARKET_DIGEST_EMAIL_KEY), fallback),
    enabled: parseEnabled(getSyncMeta(MARKET_DIGEST_ENABLED_KEY)),
    lastSentAt: getSyncMeta(MARKET_DIGEST_LAST_SENT_KEY)?.trim() || null,
    lastWeekKey: getSyncMeta(MARKET_DIGEST_LAST_WEEK_KEY)?.trim() || null,
    defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
  }
}

/** Authoritative Postgres read. */
export async function getMarketDigestConfigFresh(): Promise<MarketDigestConfig> {
  const fallback = await getContactNotifyEmailFresh()
  try {
    const [emailRaw, enabledRaw, lastSent, lastWeek] = await Promise.all([
      getSyncMetaFresh(MARKET_DIGEST_EMAIL_KEY),
      getSyncMetaFresh(MARKET_DIGEST_ENABLED_KEY),
      getSyncMetaFresh(MARKET_DIGEST_LAST_SENT_KEY),
      getSyncMetaFresh(MARKET_DIGEST_LAST_WEEK_KEY),
    ])
    return {
      email: resolveEmail(emailRaw, fallback),
      enabled: parseEnabled(enabledRaw),
      lastSentAt: lastSent?.trim() || null,
      lastWeekKey: lastWeek?.trim() || null,
      defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    }
  } catch {
    return {
      email: fallback,
      enabled: true,
      lastSentAt: null,
      lastWeekKey: null,
      defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    }
  }
}

export async function setMarketDigestEmail(value: string): Promise<string> {
  const trimmed = value.trim()
  if (!isValidEmail(trimmed)) throw new Error('Invalid email address')
  await setSyncMetaDurable(MARKET_DIGEST_EMAIL_KEY, trimmed)
  return trimmed
}

export async function setMarketDigestEnabled(enabled: boolean): Promise<boolean> {
  await setSyncMetaDurable(MARKET_DIGEST_ENABLED_KEY, enabled ? '1' : '0')
  return enabled
}

export async function markMarketDigestSent(weekKey: string): Promise<void> {
  const iso = new Date().toISOString()
  await setSyncMetaDurable(MARKET_DIGEST_LAST_SENT_KEY, iso)
  await setSyncMetaDurable(MARKET_DIGEST_LAST_WEEK_KEY, weekKey)
}

/** Monday date key in America/New_York (YYYY-MM-DD of that week's Monday). */
export function marketDigestWeekKey(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    fmt
      .formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const y = Number(parts.year)
  const m = Number(parts.month)
  const d = Number(parts.day)
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const wd = weekdayIndex[parts.weekday] ?? 1
  const daysFromMonday = wd === 0 ? 6 : wd - 1
  // Civil-date arithmetic in UTC so DST does not shift the calendar day.
  const mondayMs = Date.UTC(y, m - 1, d) - daysFromMonday * 86_400_000
  const monday = new Date(mondayMs)
  const my = monday.getUTCFullYear()
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0')
  const md = String(monday.getUTCDate()).padStart(2, '0')
  return `${my}-${mm}-${md}`
}
