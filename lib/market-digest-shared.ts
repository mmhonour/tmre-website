/** Client-safe market digest config types. */

import {
  weekdayEtLabel,
  type SyncScheduleWeekdayEt,
} from '@/lib/sync-schedule-config-shared'

/** Historical default (Monday). Prefer `defaultMarketDigestSubjectTemplate(weekdayEt)`. */
export const DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE =
  'Monday market brief — months supply & inventory ({date})'

const DAY_NAME_RE =
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(\s+market brief\b)/i

export function defaultMarketDigestSubjectTemplate(
  weekdayEt: SyncScheduleWeekdayEt = 1,
): string {
  return `${weekdayEtLabel(weekdayEt)} market brief — months supply & inventory ({date})`
}

/**
 * When the send day changes, keep a custom subject but swap the leading day
 * name; if the template still matches the prior default, use the new default.
 */
export function subjectTemplateForWeekdayChange(
  current: string,
  fromWeekdayEt: SyncScheduleWeekdayEt,
  toWeekdayEt: SyncScheduleWeekdayEt,
): string {
  if (fromWeekdayEt === toWeekdayEt) return current
  const trimmed = current.trim()
  const fromDefault = defaultMarketDigestSubjectTemplate(fromWeekdayEt)
  const toDefault = defaultMarketDigestSubjectTemplate(toWeekdayEt)
  if (!trimmed || trimmed === fromDefault || trimmed === DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE) {
    return toDefault
  }
  if (DAY_NAME_RE.test(trimmed)) {
    return trimmed.replace(DAY_NAME_RE, `${weekdayEtLabel(toWeekdayEt)}$2`)
  }
  return trimmed
}

/**
 * Force the leading day name in a subject template to match the send-day
 * pick list (e.g. stale “Monday …” after the schedule moved to Tuesday).
 */
export function alignSubjectTemplateToWeekday(
  template: string,
  weekdayEt: SyncScheduleWeekdayEt,
): string {
  const trimmed = template.trim()
  if (!trimmed) return defaultMarketDigestSubjectTemplate(weekdayEt)
  if (DAY_NAME_RE.test(trimmed)) {
    return trimmed.replace(DAY_NAME_RE, `${weekdayEtLabel(weekdayEt)}$2`)
  }
  return trimmed
}

export type MarketDigestConfig = {
  email: string
  enabled: boolean
  lastSentAt: string | null
  lastWeekKey: string | null
  /** Fallback when digest email unset. */
  defaultEmail: string
  /**
   * Subject line template. `{date}` → Eastern long date for the configured
   * send weekday that week (e.g. Monday, August 3, 2026) — not “today”.
   */
  subjectTemplate: string
  /** When true, append Admin social-profile handles in the email footer. */
  includeSocialProfiles: boolean
  /**
   * Weekly send day (America/New_York, 0=Sun … 6=Sat).
   * Sourced from sync_schedule_config.jobs['market-digest'] — same as Sync Dashboard.
   */
  weekdayEt: SyncScheduleWeekdayEt
  /** HH:MM ET start — same sync_schedule_config job as Sync Dashboard. */
  startTimeEt: string
}
