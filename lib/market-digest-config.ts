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
  alignSubjectTemplateToWeekday,
  defaultMarketDigestSubjectTemplate,
  type MarketDigestConfig,
} from '@/lib/market-digest-shared'
import {
  readSyncScheduleConfig,
  readSyncScheduleConfigFresh,
} from '@/lib/sync-schedule-config'
import {
  resolveWeekdayEt,
  type SyncScheduleWeekdayEt,
} from '@/lib/sync-schedule-config-shared'

export type { MarketDigestConfig } from '@/lib/market-digest-shared'
export {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  alignSubjectTemplateToWeekday,
  defaultMarketDigestSubjectTemplate,
  subjectTemplateForWeekdayChange,
} from '@/lib/market-digest-shared'

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

function resolveSubjectTemplate(
  raw: string | null | undefined,
  weekdayEt: SyncScheduleWeekdayEt,
): string {
  const trimmed = raw?.trim()
  if (trimmed && trimmed.length <= SUBJECT_MAX) return trimmed
  return defaultMarketDigestSubjectTemplate(weekdayEt)
}

function buildConfig(parts: {
  emailRaw: string | null | undefined
  enabledRaw: string | null | undefined
  lastSent: string | null | undefined
  lastWeek: string | null | undefined
  subjectRaw: string | null | undefined
  socialRaw: string | null | undefined
  fallbackEmail: string
  weekdayEt: SyncScheduleWeekdayEt
  startTimeEt: string
}): MarketDigestConfig {
  return {
    email: resolveEmail(parts.emailRaw, parts.fallbackEmail),
    enabled: parseEnabled(parts.enabledRaw),
    lastSentAt: parts.lastSent?.trim() || null,
    lastWeekKey: parts.lastWeek?.trim() || null,
    defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    subjectTemplate: alignSubjectTemplateToWeekday(
      resolveSubjectTemplate(parts.subjectRaw, parts.weekdayEt),
      parts.weekdayEt,
    ),
    includeSocialProfiles: parseIncludeSocial(parts.socialRaw),
    weekdayEt: parts.weekdayEt,
    startTimeEt: parts.startTimeEt,
  }
}

function scheduleFieldsFromConfig(schedule: {
  jobs: { 'market-digest': { weekdayEt?: SyncScheduleWeekdayEt; startTimeEt: string } }
}): { weekdayEt: SyncScheduleWeekdayEt; startTimeEt: string } {
  const job = schedule.jobs['market-digest']
  return {
    weekdayEt: resolveWeekdayEt(job),
    startTimeEt: job.startTimeEt || '08:00',
  }
}

/** Cached config for hydrated Next server. */
export function getMarketDigestConfig(): MarketDigestConfig {
  const { weekdayEt, startTimeEt } = scheduleFieldsFromConfig(
    readSyncScheduleConfig(),
  )
  return buildConfig({
    emailRaw: getSyncMeta(MARKET_DIGEST_EMAIL_KEY),
    enabledRaw: getSyncMeta(MARKET_DIGEST_ENABLED_KEY),
    lastSent: getSyncMeta(MARKET_DIGEST_LAST_SENT_KEY),
    lastWeek: getSyncMeta(MARKET_DIGEST_LAST_WEEK_KEY),
    subjectRaw: getSyncMeta(MARKET_DIGEST_SUBJECT_KEY),
    socialRaw: getSyncMeta(MARKET_DIGEST_INCLUDE_SOCIAL_KEY),
    fallbackEmail: getContactNotifyEmail(),
    weekdayEt,
    startTimeEt,
  })
}

/** Authoritative Postgres read (content keys + shared sync_schedule_config day/time). */
export async function getMarketDigestConfigFresh(): Promise<MarketDigestConfig> {
  const fallback = await getContactNotifyEmailFresh()
  try {
    const [emailRaw, enabledRaw, lastSent, lastWeek, subjectRaw, socialRaw, schedule] =
      await Promise.all([
        getSyncMetaFresh(MARKET_DIGEST_EMAIL_KEY),
        getSyncMetaFresh(MARKET_DIGEST_ENABLED_KEY),
        getSyncMetaFresh(MARKET_DIGEST_LAST_SENT_KEY),
        getSyncMetaFresh(MARKET_DIGEST_LAST_WEEK_KEY),
        getSyncMetaFresh(MARKET_DIGEST_SUBJECT_KEY),
        getSyncMetaFresh(MARKET_DIGEST_INCLUDE_SOCIAL_KEY),
        readSyncScheduleConfigFresh(),
      ])
    const { weekdayEt, startTimeEt } = scheduleFieldsFromConfig(schedule)
    return buildConfig({
      emailRaw,
      enabledRaw,
      lastSent,
      lastWeek,
      subjectRaw,
      socialRaw,
      fallbackEmail: fallback,
      weekdayEt,
      startTimeEt,
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
      weekdayEt: 1,
      startTimeEt: '08:00',
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
  const { weekdayEt } = scheduleFieldsFromConfig(
    await readSyncScheduleConfigFresh(),
  )
  const trimmed = value.trim()
  if (!trimmed) {
    await setSyncMetaDurable(MARKET_DIGEST_SUBJECT_KEY, '')
    return defaultMarketDigestSubjectTemplate(weekdayEt)
  }
  if (trimmed.length > SUBJECT_MAX) {
    throw new Error(`Subject template must be ≤ ${SUBJECT_MAX} characters`)
  }
  const aligned = alignSubjectTemplateToWeekday(trimmed, weekdayEt)
  await setSyncMetaDurable(MARKET_DIGEST_SUBJECT_KEY, aligned)
  return aligned
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

/** sync_meta lock so the every-30m thin cron cannot overlap Resend sends. */
export const MARKET_DIGEST_SEND_LOCK_KEY = 'market_digest_send_lock'

/** Background worker budget is ~15m — steal only if a prior holder died. */
export const MARKET_DIGEST_SEND_LOCK_STALE_MS = 20 * 60 * 1000

/**
 * True when this week's brief was already stamped (once-per-week watermark).
 * Thin cron should skip queueing when true — otherwise a slow worker plus the
 * dense alarm re-sends all morning.
 */
export async function isMarketDigestAlreadySentThisWeek(
  now = new Date(),
): Promise<boolean> {
  try {
    const [lastWeek, schedule] = await Promise.all([
      getSyncMetaFresh(MARKET_DIGEST_LAST_WEEK_KEY),
      readSyncScheduleConfigFresh(),
    ])
    const { weekdayEt } = scheduleFieldsFromConfig(schedule)
    const weekKey = marketDigestWeekKey(now, weekdayEt)
    return Boolean(lastWeek?.trim() && lastWeek.trim() === weekKey)
  } catch {
    return false
  }
}

/**
 * Long Eastern date for the configured send weekday in `now`'s week
 * (same calendar day as {@link marketDigestWeekKey}).
 */
export function formatMarketDigestEtDateForWeekday(
  now: Date = new Date(),
  weekdayEt: SyncScheduleWeekdayEt = 1,
): string {
  const weekKey = marketDigestWeekKey(now, weekdayEt)
  const [y, m, d] = weekKey.split('-').map(Number)
  if (!y || !m || !d) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)
  }
  // Noon-ish UTC keeps the civil ET date stable across DST edges.
  const date = new Date(Date.UTC(y, m - 1, d, 16, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/** Apply `{date}` (and trim) to the admin subject template. */
export function renderMarketDigestSubject(
  template: string,
  etDate: string,
  weekdayEt: SyncScheduleWeekdayEt = 1,
): string {
  const resolved = resolveSubjectTemplate(template, weekdayEt)
  const base = alignSubjectTemplateToWeekday(resolved, weekdayEt)
  const rendered = base.replaceAll('{date}', etDate).trim()
  return (
    rendered ||
    defaultMarketDigestSubjectTemplate(weekdayEt).replace('{date}', etDate)
  )
}

/**
 * Send-day date key in America/New_York (YYYY-MM-DD of that week's configured
 * weekday — Monday by default). Used as the once-per-week watermark.
 */
export function marketDigestWeekKey(
  now: Date = new Date(),
  weekdayEt: SyncScheduleWeekdayEt = 1,
): string {
  const targetWeekday = ((weekdayEt % 7) + 7) % 7
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
  const daysFromTarget = (wd - targetWeekday + 7) % 7
  // Civil-date arithmetic in UTC so DST does not shift the calendar day.
  const targetMs = Date.UTC(y, m - 1, d) - daysFromTarget * 86_400_000
  const target = new Date(targetMs)
  const ty = target.getUTCFullYear()
  const tm = String(target.getUTCMonth() + 1).padStart(2, '0')
  const td = String(target.getUTCDate()).padStart(2, '0')
  return `${ty}-${tm}-${td}`
}
