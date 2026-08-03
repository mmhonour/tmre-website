import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_CONTACT_NOTIFY_EMAIL,
  getContactNotifyEmail,
  getContactNotifyEmailFresh,
  isValidEmail,
} from '@/lib/contact-notify-config'
import {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  type MarketDigestConfig,
} from '@/lib/market-digest-shared'

export type { MarketDigestConfig } from '@/lib/market-digest-shared'
export { DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE } from '@/lib/market-digest-shared'

export const MARKET_DIGEST_EMAIL_KEY = 'market_digest_email'
export const MARKET_DIGEST_ENABLED_KEY = 'market_digest_enabled'
export const MARKET_DIGEST_LAST_SENT_KEY = 'market_digest_last_sent_at'
export const MARKET_DIGEST_LAST_WEEK_KEY = 'market_digest_last_week_key'
export const MARKET_DIGEST_SUBJECT_KEY = 'market_digest_subject_template'
export const MARKET_DIGEST_INCLUDE_SOCIAL_KEY = 'market_digest_include_social'

const SUBJECT_MAX = 200

function parseEnabled(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

/** Social footer is opt-in (default off). */
function parseIncludeSocial(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return false
  return raw === '1' || raw.toLowerCase() === 'true'
}

function resolveEmail(raw: string | null | undefined, fallback: string): string {
  if (raw && isValidEmail(raw)) return raw.trim()
  return fallback
}

function resolveSubjectTemplate(raw: string | null | undefined): string {
  const trimmed = raw?.trim()
  if (trimmed && trimmed.length <= SUBJECT_MAX) return trimmed
  return DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE
}

function buildConfig(parts: {
  emailRaw: string | null | undefined
  enabledRaw: string | null | undefined
  lastSent: string | null | undefined
  lastWeek: string | null | undefined
  subjectRaw: string | null | undefined
  socialRaw: string | null | undefined
  fallbackEmail: string
}): MarketDigestConfig {
  return {
    email: resolveEmail(parts.emailRaw, parts.fallbackEmail),
    enabled: parseEnabled(parts.enabledRaw),
    lastSentAt: parts.lastSent?.trim() || null,
    lastWeekKey: parts.lastWeek?.trim() || null,
    defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    subjectTemplate: resolveSubjectTemplate(parts.subjectRaw),
    includeSocialProfiles: parseIncludeSocial(parts.socialRaw),
  }
}

/** Cached config for hydrated Next server. */
export function getMarketDigestConfig(): MarketDigestConfig {
  return buildConfig({
    emailRaw: getSyncMeta(MARKET_DIGEST_EMAIL_KEY),
    enabledRaw: getSyncMeta(MARKET_DIGEST_ENABLED_KEY),
    lastSent: getSyncMeta(MARKET_DIGEST_LAST_SENT_KEY),
    lastWeek: getSyncMeta(MARKET_DIGEST_LAST_WEEK_KEY),
    subjectRaw: getSyncMeta(MARKET_DIGEST_SUBJECT_KEY),
    socialRaw: getSyncMeta(MARKET_DIGEST_INCLUDE_SOCIAL_KEY),
    fallbackEmail: getContactNotifyEmail(),
  })
}

/** Authoritative Postgres read. */
export async function getMarketDigestConfigFresh(): Promise<MarketDigestConfig> {
  const fallback = await getContactNotifyEmailFresh()
  try {
    const [emailRaw, enabledRaw, lastSent, lastWeek, subjectRaw, socialRaw] =
      await Promise.all([
        getSyncMetaFresh(MARKET_DIGEST_EMAIL_KEY),
        getSyncMetaFresh(MARKET_DIGEST_ENABLED_KEY),
        getSyncMetaFresh(MARKET_DIGEST_LAST_SENT_KEY),
        getSyncMetaFresh(MARKET_DIGEST_LAST_WEEK_KEY),
        getSyncMetaFresh(MARKET_DIGEST_SUBJECT_KEY),
        getSyncMetaFresh(MARKET_DIGEST_INCLUDE_SOCIAL_KEY),
      ])
    return buildConfig({
      emailRaw,
      enabledRaw,
      lastSent,
      lastWeek,
      subjectRaw,
      socialRaw,
      fallbackEmail: fallback,
    })
  } catch {
    return buildConfig({
      emailRaw: null,
      enabledRaw: null,
      lastSent: null,
      lastWeek: null,
      subjectRaw: null,
      socialRaw: null,
      fallbackEmail: fallback,
    })
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

export async function setMarketDigestSubjectTemplate(
  value: string,
): Promise<string> {
  const trimmed = value.trim()
  if (!trimmed) {
    await setSyncMetaDurable(MARKET_DIGEST_SUBJECT_KEY, '')
    return DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE
  }
  if (trimmed.length > SUBJECT_MAX) {
    throw new Error(`Subject template must be ≤ ${SUBJECT_MAX} characters`)
  }
  await setSyncMetaDurable(MARKET_DIGEST_SUBJECT_KEY, trimmed)
  return trimmed
}

export async function setMarketDigestIncludeSocialProfiles(
  include: boolean,
): Promise<boolean> {
  await setSyncMetaDurable(MARKET_DIGEST_INCLUDE_SOCIAL_KEY, include ? '1' : '0')
  return include
}

export async function markMarketDigestSent(weekKey: string): Promise<void> {
  const iso = new Date().toISOString()
  await setSyncMetaDurable(MARKET_DIGEST_LAST_SENT_KEY, iso)
  await setSyncMetaDurable(MARKET_DIGEST_LAST_WEEK_KEY, weekKey)
}

/** Apply `{date}` (and trim) to the admin subject template. */
export function renderMarketDigestSubject(
  template: string,
  etDate: string,
): string {
  const base = resolveSubjectTemplate(template)
  const rendered = base.replaceAll('{date}', etDate).trim()
  return rendered || DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE.replace('{date}', etDate)
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
