import 'server-only'

import { LATEST_DB_REFRESH_MS } from '@/lib/latest-refresh'
import { readPostDeployFullResyncStatus } from '@/lib/deploy-full-resync-schedule'
import { nextMonday1amEt } from '@/lib/property-address-schedule'
import { STATS_CACHE_TTL_MS } from '@/lib/stats-cache'
import type { AdminSyncPanelRowId } from '@/lib/admin-sync-schedule-format'

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

function nextIntervalStart(
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

function earliestDate(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue
    if (!best || date.getTime() < best.getTime()) best = date
  }
  return best
}

export function buildAdminSyncNextRuns(input: BuildNextRunsInput, now = new Date()): AdminSyncNextRuns {
  const incrementalIntervalMs = latestIntervalMs()
  const statsIntervalMs = statsRefreshIntervalMs()

  const postDeploy = readPostDeployFullResyncStatus(now)
  const nextFullResyncWeekly = nextMonday5amEt(now)
  const nextFullResync =
    postDeploy.nextAt && postDeploy.source === 'post-deploy'
      ? new Date(postDeploy.nextAt)
      : nextFullResyncWeekly
  const nextIncremental = nextIntervalStart(input.lastIncrementalSync, incrementalIntervalMs, now)
  const nextStatsCache = nextIntervalStart(input.lastStatsCache, statsIntervalMs, now)
  const nextRefresh = earliestDate(nextIncremental, nextFullResync)
  const nextPropertyAddresses = nextMonday1amEt(now)
  const nextZipBoundaries = nextMonthDayUtc(1, 10, now)

  return {
    'full-resync': nextFullResync.toISOString(),
    incremental: nextIncremental.toISOString(),
    'latest-mls': nextIncremental.toISOString(),
    'listing-scores': nextFullResync.toISOString(),
    'refresh-finished': nextRefresh?.toISOString() ?? null,
    'stats-cache': nextStatsCache.toISOString(),
    'deal-of-the-day': nextFullResync.toISOString(),
    'property-addresses': nextPropertyAddresses.toISOString(),
    'zip-boundaries': nextZipBoundaries.toISOString(),
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

export function buildAdminSyncScheduleHints(now = new Date()): AdminSyncScheduleHints {
  const postDeploy = readPostDeployFullResyncStatus(now)
  return {
    fullResyncSource: postDeploy.source,
    postDeployScheduledAt: postDeploy.scheduledAt,
    postDeployDeployId: postDeploy.deployId,
  }
}
