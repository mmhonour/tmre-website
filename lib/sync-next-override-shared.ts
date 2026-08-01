import {
  SCHEDULED_SYNC_JOB_IDS,
  type ScheduledSyncJobId,
} from '@/lib/scheduled-sync-jobs-shared'

export type SyncNextOverrideJobId = ScheduledSyncJobId

export type SyncNextOverrides = Partial<Record<SyncNextOverrideJobId, string>>

/** Nudge step when spinning Next earlier/later. */
export function syncNextOverrideStepMs(jobId: SyncNextOverrideJobId): number {
  switch (jobId) {
    case 'incremental':
    case 'stats-cache':
      return 5 * 60_000
    case 'listing-scores':
    case 'deal-of-the-day':
    case 'property-addresses':
      return 30 * 60_000
    case 'full-resync':
      return 60 * 60_000
    case 'zip-boundaries':
      return 24 * 60 * 60_000
    case 'fomc-sync':
    case 'cpi-sync':
      return 30 * 60_000
    default:
      return 5 * 60_000
  }
}

export function isSyncNextOverrideJobId(value: string): value is SyncNextOverrideJobId {
  return (SCHEDULED_SYNC_JOB_IDS as readonly string[]).includes(value)
}

/**
 * Next practical wall-clock when Netlify can honor a due time.
 * Override/natural "Next" may land between cron wakes — this is the wake that
 * can actually run the job (e.g. Incremental only at :00 / :30).
 */
export function nextPracticalTakeHoldIso(
  jobId: SyncNextOverrideJobId,
  dueAtIso: string | null | undefined,
  now = new Date(),
): string | null {
  const dueMs = dueAtIso ? Date.parse(dueAtIso) : NaN
  const baseMs = Number.isFinite(dueMs)
    ? Math.max(dueMs, now.getTime())
    : now.getTime()
  const base = new Date(baseMs)

  switch (jobId) {
    case 'incremental':
    case 'stats-cache':
      return nextHalfHourSlotAtOrAfter(base).toISOString()
    case 'full-resync':
    case 'listing-scores':
    case 'deal-of-the-day':
      return nextMondayEtSlotAtOrAfter(5, 0, base).toISOString()
    case 'property-addresses':
      return nextMondayEtSlotAtOrAfter(1, 0, base).toISOString()
    case 'zip-boundaries':
      return nextMonthDayUtcAtOrAfter(1, 10, base).toISOString()
    case 'fomc-sync':
    case 'cpi-sync':
      return nextHalfHourSlotAtOrAfter(base).toISOString()
    default:
      return base.toISOString()
  }
}

/** Netlify every-30-minutes cron — wakes at :00 and :30. */
function nextHalfHourSlotAtOrAfter(from: Date): Date {
  const slot = new Date(from.getTime())
  slot.setSeconds(0, 0)
  slot.setMilliseconds(0)
  const minute = slot.getMinutes()
  if (minute > 0 && minute < 30) {
    slot.setMinutes(30)
    return slot
  }
  if (minute > 30) {
    slot.setHours(slot.getHours() + 1)
    slot.setMinutes(0)
    return slot
  }
  // Exactly :00 or :30 — keep unless `from` is already past that instant.
  if (slot.getTime() < from.getTime()) {
    if (minute === 0) slot.setMinutes(30)
    else {
      slot.setHours(slot.getHours() + 1)
      slot.setMinutes(0)
    }
  }
  return slot
}

/** Next Monday HH:MM America/New_York on or after `from`. */
function nextMondayEtSlotAtOrAfter(
  hour: number,
  minute: number,
  from: Date,
): Date {
  const ET = 'America/New_York'
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
    if (etAsUtc <= mondaySlot) {
      return new Date(from.getTime() + Math.max(0, mondaySlot - etAsUtc))
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
  return new Date(from.getTime() + Math.max(0, targetAsUtc - etAsUtc))
}

/** Next UTC calendar day `day` at `hour`:00 on or after `from`. */
function nextMonthDayUtcAtOrAfter(day: number, hour: number, from: Date): Date {
  const candidate = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day, hour, 0, 0, 0),
  )
  if (candidate.getTime() >= from.getTime()) return candidate
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, day, hour, 0, 0, 0),
  )
}
