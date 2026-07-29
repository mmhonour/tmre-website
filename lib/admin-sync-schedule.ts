import 'server-only'

import { LATEST_DB_REFRESH_MS } from '@/lib/latest-refresh'
import { readPostDeployFullResyncStatus } from '@/lib/deploy-full-resync-schedule'
import { STATS_CACHE_TTL_MS } from '@/lib/stats-cache'
import type { AdminSyncPanelRowId } from '@/lib/admin-sync-schedule-format'
import { applySyncNextOverride } from '@/lib/sync-next-override'
import { SCHEDULED_SYNC_JOB_BY_ROW } from '@/lib/scheduled-sync-jobs'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  defaultSyncScheduleConfig,
  frequencyIntervalMs,
  parseStartTimeEt,
  type SyncJobScheduleConfig,
  type SyncScheduleConfig,
} from '@/lib/sync-schedule-config-shared'
import { getSyncMeta } from '@/lib/db/sync-meta-store'

export type { AdminSyncPanelRowId } from '@/lib/admin-sync-schedule-format'
export { formatAdminNextSyncAt } from '@/lib/admin-sync-schedule-format'

export type AdminSyncNextRuns = Record<AdminSyncPanelRowId, string | null>

export type AdminSyncScheduleHints = {
  fullResyncSource: 'post-deploy' | 'weekly' | null
  postDeployScheduledAt: string | null
  postDeployDeployId: string | null
}

type BuildNextRunsInput = {
  lastFullSyncStarted: string | null
  lastFullSync: string | null
  lastIncrementalSyncStarted: string | null
  lastIncrementalSync: string | null
  lastListingScoresStarted: string | null
  lastListingScores: string | null
  lastRefreshStarted: string | null
  lastRefreshFinished: string | null
  lastStatsCacheStarted: string | null
  lastStatsCache: string | null
  lastDealOfTheDayCacheStarted: string | null
  lastDealOfTheDayCache: string | null
}

const ET = 'America/New_York'

/** Milliseconds until the next daily time in America/New_York. */
export function msUntilNextDailyTimeEt(
  hour: number,
  minute: number,
  from = new Date(),
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(from)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const y = get('year')
  const m = get('month')
  const d = get('day')
  const etHour = get('hour') === 24 ? 0 : get('hour')
  const etMinute = get('minute')
  const etSecond = get('second')

  const etAsUtc = Date.UTC(y, m - 1, d, etHour, etMinute, etSecond)
  let targetAsUtc = Date.UTC(y, m - 1, d, hour, minute, 0)
  if (etAsUtc >= targetAsUtc) {
    targetAsUtc += 24 * 60 * 60 * 1000
  }

  return Math.max(60_000, targetAsUtc - etAsUtc)
}

export function nextDailyTimeEt(
  hour: number,
  minute: number,
  from = new Date(),
): Date {
  return new Date(from.getTime() + msUntilNextDailyTimeEt(hour, minute, from))
}

export function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Most recent daily wall time in America/New_York that is on or before `before`. */
export function lastPastDailySlotEt(
  hour: number,
  minute: number,
  before = new Date(),
): Date {
  const dayBefore = new Date(before.getTime() - 24 * 60 * 60 * 1000)
  let candidate = nextDailyTimeEt(hour, minute, dayBefore)
  if (candidate.getTime() > before.getTime()) {
    candidate = new Date(candidate.getTime() - 24 * 60 * 60 * 1000)
  }
  return candidate
}

/** Most recent Monday wall time in America/New_York that is on or before `before`. */
export function lastPastMondaySlotEt(
  hour: number,
  minute: number,
  before = new Date(),
): Date {
  const weekAgo = new Date(before.getTime() - 7 * 24 * 60 * 60 * 1000)
  const nextSlot = nextMondayTimeEt(hour, minute, weekAgo)
  if (nextSlot.getTime() > before.getTime()) {
    return new Date(nextSlot.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
  return nextSlot
}

/** Milliseconds until the next Monday HH:MM America/New_York (EST/EDT). */
export function msUntilNextMondayTimeEt(
  hour: number,
  minute: number,
  from = new Date(),
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(from)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  const weekday = get('weekday')
  const etHour = Number(get('hour') === '24' ? '0' : get('hour'))
  const etMinute = Number(get('minute'))
  const etSecond = Number(get('second'))

  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const dayOfWeek = weekdayIndex[weekday] ?? 0
  const etAsUtc = Date.UTC(y, m - 1, d, etHour, etMinute, etSecond)

  let daysUntilMonday = (8 - dayOfWeek) % 7
  if (dayOfWeek === 1) {
    const mondaySlot = Date.UTC(y, m - 1, d, hour, minute, 0)
    if (etAsUtc < mondaySlot) {
      return Math.max(60_000, mondaySlot - etAsUtc)
    }
    daysUntilMonday = 7
  } else if (daysUntilMonday === 0) {
    daysUntilMonday = 7
  }

  const targetDate = new Date(Date.UTC(y, m - 1, d + daysUntilMonday, hour, minute, 0))
  const targetAsUtc = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
    hour,
    minute,
    0,
  )

  return Math.max(60_000, targetAsUtc - etAsUtc)
}

export function nextMondayTimeEt(
  hour: number,
  minute: number,
  from = new Date(),
): Date {
  return new Date(from.getTime() + msUntilNextMondayTimeEt(hour, minute, from))
}

/** Next Monday 5:00 AM America/New_York — weekly full MLS reload slot. */
export function nextMonday5amEt(from = new Date()): Date {
  return nextMondayTimeEt(5, 0, from)
}

export function isIntervalSyncOverdue(
  lastFinishedIso: string | null | undefined,
  intervalMs: number,
  now = new Date(),
  graceMs = 60_000,
): boolean {
  const lastMs = parseIsoMs(lastFinishedIso)
  if (lastMs == null) return false
  return now.getTime() - lastMs >= Math.max(60_000, intervalMs) + graceMs
}

export function isDailySyncOverdue(
  lastFinishedIso: string | null | undefined,
  hour: number,
  minute: number,
  now = new Date(),
): boolean {
  const lastMs = parseIsoMs(lastFinishedIso)
  if (lastMs == null) return false
  const dueSlot = lastPastDailySlotEt(hour, minute, now)
  return lastMs < dueSlot.getTime()
}

export function isWeeklyMondaySyncOverdue(
  lastFinishedIso: string | null | undefined,
  hour: number,
  minute: number,
  now = new Date(),
): boolean {
  const lastMs = parseIsoMs(lastFinishedIso)
  if (lastMs == null) return false
  const dueSlot = lastPastMondaySlotEt(hour, minute, now)
  return lastMs < dueSlot.getTime()
}

function latestIntervalMs(): number {
  return Math.max(
    60_000,
    Number(process.env.LATEST_SYNC_INTERVAL_MS ?? String(LATEST_DB_REFRESH_MS)),
  )
}

function statsRefreshIntervalMs(): number {
  return Math.max(
    60_000,
    Number(process.env.STATS_CACHE_REFRESH_MS ?? String(STATS_CACHE_TTL_MS)),
  )
}

export { latestIntervalMs, statsRefreshIntervalMs }

/** Next wall-clock slot aligned to N-minute cadence (e.g. :00 and :30). */
function nextMinuteCadenceSlot(intervalMinutes: number, from = new Date()): Date {
  const slot = new Date(from)
  slot.setSeconds(0, 0)
  slot.setMilliseconds(0)

  const minute = slot.getMinutes()
  const nextMinute = Math.ceil((minute + 1) / intervalMinutes) * intervalMinutes
  if (nextMinute >= 60) {
    slot.setHours(slot.getHours() + 1)
    slot.setMinutes(0)
  } else {
    slot.setMinutes(nextMinute)
  }
  return slot
}

/** Next run from last finish + interval, or next cadence slot when overdue/never. */
export function nextIntervalStartFromLast(
  lastFinishedIso: string | null,
  intervalMs: number,
  from = new Date(),
): Date {
  const lastMs = parseIsoMs(lastFinishedIso)
  if (lastMs != null) {
    const candidate = lastMs + intervalMs
    if (candidate > from.getTime()) {
      return new Date(candidate)
    }
  }

  const intervalMinutes = Math.max(1, Math.round(intervalMs / 60_000))
  return nextMinuteCadenceSlot(intervalMinutes, from)
}

/** @deprecated use nextIntervalStartFromLast */
function nextIntervalStart(
  lastFinishedIso: string | null,
  intervalMs: number,
  from = new Date(),
): Date {
  return nextIntervalStartFromLast(lastFinishedIso, intervalMs, from)
}

function earliestDate(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue
    if (!best || date.getTime() < best.getTime()) best = date
  }
  return best
}

export function computeNaturalNextRunIso(
  job: SyncJobScheduleConfig,
  lastFinishedIso: string | null,
  now = new Date(),
): string {
  const { hour, minute } = parseStartTimeEt(job.startTimeEt)
  const intervalMs = frequencyIntervalMs(job.frequency)

  if (intervalMs != null) {
    return nextIntervalStartFromLast(
      lastFinishedIso,
      intervalMs,
      now,
    ).toISOString()
  }
  if (job.frequency === 'daily') {
    return nextDailyTimeEt(hour, minute, now).toISOString()
  }
  if (job.frequency === 'weekly') {
    return nextMondayTimeEt(hour, minute, now).toISOString()
  }
  return nextMonthDayEt(1, hour, minute, now).toISOString()
}

export function isJobDueBySchedule(
  job: SyncJobScheduleConfig,
  lastFinishedIso: string | null,
  now = new Date(),
): boolean {
  const { hour, minute } = parseStartTimeEt(job.startTimeEt)
  const intervalMs = frequencyIntervalMs(job.frequency)
  const lastMs = parseIsoMs(lastFinishedIso)

  if (intervalMs != null) {
    if (lastMs == null) return true
    return isIntervalSyncOverdue(lastFinishedIso, intervalMs, now)
  }
  if (job.frequency === 'daily') {
    if (lastMs == null) return true
    return isDailySyncOverdue(lastFinishedIso, hour, minute, now)
  }
  if (job.frequency === 'weekly') {
    if (lastMs == null) return true
    return isWeeklyMondaySyncOverdue(lastFinishedIso, hour, minute, now)
  }
  if (lastMs == null) return true
  const dueSlot = lastPastMonthDayEt(1, hour, minute, now)
  return lastMs < dueSlot.getTime()
}

function lastPastMonthDayEt(
  day: number,
  hour: number,
  minute: number,
  before: Date,
): Date {
  const probe = new Date(before.getTime() - 35 * 24 * 60 * 60 * 1000)
  let candidate = nextMonthDayEt(day, hour, minute, probe)
  for (let i = 0; i < 6; i++) {
    const next = nextMonthDayEt(day, hour, minute, candidate)
    if (next.getTime() > before.getTime()) return candidate
    candidate = next
  }
  return candidate
}

function lastFinishedForJob(
  jobId: ScheduledSyncJobId,
  input: BuildNextRunsInput,
): string | null {
  switch (jobId) {
    case 'full-resync':
      return input.lastFullSync
    case 'incremental':
      return input.lastIncrementalSync
    case 'listing-scores':
      return input.lastListingScores
    case 'stats-cache':
      return input.lastStatsCache
    case 'deal-of-the-day':
      return input.lastDealOfTheDayCache
    case 'property-addresses':
      return getSyncMeta('property_addresses_synced_at')
    case 'zip-boundaries':
      return getSyncMeta('last_zip_boundaries_sync')
    default:
      return null
  }
}

export function buildAdminSyncNextRuns(
  input: BuildNextRunsInput,
  now = new Date(),
  schedule?: SyncScheduleConfig | null,
): AdminSyncNextRuns {
  // Callers should pass Configure schedule from sync_meta; defaults otherwise.
  const config = schedule ?? defaultSyncScheduleConfig()

  const postDeploy = readPostDeployFullResyncStatus(now)

  const naturalFor = (jobId: ScheduledSyncJobId): string => {
    const job = config.jobs[jobId]
    let natural = computeNaturalNextRunIso(
      job,
      lastFinishedForJob(jobId, input),
      now,
    )
    // Post-deploy full resync still wins when scheduled.
    if (
      jobId === 'full-resync' &&
      postDeploy.nextAt &&
      postDeploy.source === 'post-deploy'
    ) {
      const postMs = Date.parse(postDeploy.nextAt)
      const naturalMs = Date.parse(natural)
      if (!Number.isNaN(postMs) && (Number.isNaN(naturalMs) || postMs < naturalMs)) {
        natural = postDeploy.nextAt
      }
    }
    return natural
  }

  const nextFullResyncIso = applySyncNextOverride(
    naturalFor('full-resync'),
    SCHEDULED_SYNC_JOB_BY_ROW['full-resync'],
  )
  const nextIncrementalIso = applySyncNextOverride(
    naturalFor('incremental'),
    SCHEDULED_SYNC_JOB_BY_ROW.incremental,
  )
  const nextStatsCacheIso = applySyncNextOverride(
    naturalFor('stats-cache'),
    SCHEDULED_SYNC_JOB_BY_ROW['stats-cache'],
  )
  const nextListingScoresIso = applySyncNextOverride(
    naturalFor('listing-scores'),
    SCHEDULED_SYNC_JOB_BY_ROW['listing-scores'],
  )
  const nextDealOfTheDayIso = applySyncNextOverride(
    naturalFor('deal-of-the-day'),
    SCHEDULED_SYNC_JOB_BY_ROW['deal-of-the-day'],
  )
  const nextPropertyAddressesIso = applySyncNextOverride(
    naturalFor('property-addresses'),
    SCHEDULED_SYNC_JOB_BY_ROW['property-addresses'],
  )
  const nextZipBoundariesIso = applySyncNextOverride(
    naturalFor('zip-boundaries'),
    SCHEDULED_SYNC_JOB_BY_ROW['zip-boundaries'],
  )

  const nextIncrementalDate = nextIncrementalIso ? new Date(nextIncrementalIso) : null
  const nextFullResyncDate = nextFullResyncIso ? new Date(nextFullResyncIso) : null
  const nextRefresh = earliestDate(nextIncrementalDate, nextFullResyncDate)

  return {
    'full-resync': nextFullResyncIso,
    incremental: nextIncrementalIso,
    'latest-mls': nextIncrementalIso,
    'listing-scores': nextListingScoresIso,
    'refresh-finished': nextRefresh?.toISOString() ?? null,
    'stats-cache': nextStatsCacheIso,
    'deal-of-the-day': nextDealOfTheDayIso,
    'property-addresses': nextPropertyAddressesIso,
    'zip-boundaries': nextZipBoundariesIso,
  }
}

/** Next UTC wall-clock on calendar day `day` at `hour`:00 (e.g. monthly cron). */
export function nextMonthDayUtc(day: number, hour: number, from = new Date()): Date {
  const candidate = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day, hour, 0, 0, 0),
  )
  if (candidate.getTime() > from.getTime()) return candidate
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, day, hour, 0, 0, 0),
  )
}

/**
 * Next calendar day `day` (1–28) at HH:MM America/New_York.
 * Used for Configure “Monthly” + Start time.
 */
export function nextMonthDayEt(
  day: number,
  hour: number,
  minute: number,
  from = new Date(),
): Date {
  const safeDay = Math.min(28, Math.max(1, Math.floor(day)))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(from)

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const y = get('year')
  const m = get('month')
  const d = get('day')
  const etHour = get('hour') === 24 ? 0 : get('hour')
  const etMinute = get('minute')
  const etSecond = get('second')
  const etAsUtc = Date.UTC(y, m - 1, d, etHour, etMinute, etSecond)

  const targetThisMonth = Date.UTC(y, m - 1, safeDay, hour, minute, 0)
  if (etAsUtc < targetThisMonth) {
    return new Date(from.getTime() + (targetThisMonth - etAsUtc))
  }
  const targetNextMonth = Date.UTC(y, m, safeDay, hour, minute, 0)
  return new Date(from.getTime() + (targetNextMonth - etAsUtc))
}

export function buildAdminSyncScheduleHints(now = new Date()): AdminSyncScheduleHints {
  const postDeploy = readPostDeployFullResyncStatus(now)
  return {
    fullResyncSource: postDeploy.source,
    postDeployScheduledAt: postDeploy.scheduledAt,
    postDeployDeployId: postDeploy.deployId,
  }
}
