/**
 * Admin Configure schedule — client-safe types + defaults.
 * Netlify cron stays dense (every 30m); handlers run only when due per this config.
 */

import {
  SCHEDULED_SYNC_JOB_IDS,
  type ScheduledSyncJobId,
} from '@/lib/scheduled-sync-jobs-shared'
import type { AdminSyncActionId } from '@/lib/admin-sync-types'

export const SYNC_SCHEDULE_FREQUENCIES = [
  { id: '30m', label: '30 mins', intervalMs: 30 * 60 * 1000 },
  { id: '60m', label: '60 mins', intervalMs: 60 * 60 * 1000 },
  { id: '2h', label: '2 hr', intervalMs: 2 * 60 * 60 * 1000 },
  { id: '4h', label: '4 hr', intervalMs: 4 * 60 * 60 * 1000 },
  { id: '8h', label: '8 hr', intervalMs: 8 * 60 * 60 * 1000 },
  { id: '16h', label: '16 hr', intervalMs: 16 * 60 * 60 * 1000 },
  { id: 'daily', label: 'Daily', intervalMs: null },
  { id: 'weekly', label: 'Weekly', intervalMs: null },
  { id: 'monthly', label: 'Monthly', intervalMs: null },
  /** Calendar event day (FOMC decision / CPI release) — start time still applies. */
  { id: 'event', label: 'Event day', intervalMs: null },
] as const

export type SyncScheduleFrequencyId = (typeof SYNC_SCHEDULE_FREQUENCIES)[number]['id']

/** America/New_York weekday: 0 = Sunday … 6 = Saturday (JS Date convention). */
export const SYNC_SCHEDULE_WEEKDAYS = [
  { id: 0, short: 'Sun', label: 'Sunday' },
  { id: 1, short: 'Mon', label: 'Monday' },
  { id: 2, short: 'Tue', label: 'Tuesday' },
  { id: 3, short: 'Wed', label: 'Wednesday' },
  { id: 4, short: 'Thu', label: 'Thursday' },
  { id: 5, short: 'Fri', label: 'Friday' },
  { id: 6, short: 'Sat', label: 'Saturday' },
] as const

export type SyncScheduleWeekdayEt = (typeof SYNC_SCHEDULE_WEEKDAYS)[number]['id']

export type SyncJobScheduleConfig = {
  frequency: SyncScheduleFrequencyId
  /** HH:MM America/New_York — wall-clock for daily/weekly/monthly; phase for intervals. */
  startTimeEt: string
  /**
   * Weekly send day in America/New_York (0=Sun … 6=Sat).
   * Ignored unless frequency is `weekly`. Defaults to Monday when omitted.
   */
  weekdayEt?: SyncScheduleWeekdayEt
}

export function isSyncScheduleWeekdayEt(
  value: unknown,
): value is SyncScheduleWeekdayEt {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  )
}

/** Default weekly day when unset — Monday (historical full-resync / digest slot). */
export function resolveWeekdayEt(
  job: Pick<SyncJobScheduleConfig, 'weekdayEt'> | null | undefined,
): SyncScheduleWeekdayEt {
  return isSyncScheduleWeekdayEt(job?.weekdayEt) ? job.weekdayEt : 1
}

export function weekdayEtLabel(weekdayEt: SyncScheduleWeekdayEt): string {
  return SYNC_SCHEDULE_WEEKDAYS[weekdayEt]?.label ?? 'Monday'
}

export type SyncScheduleConfig = {
  version: 1
  /** Job # / Sync All priority (1-based order of these ids). */
  order: ScheduledSyncJobId[]
  jobs: Record<ScheduledSyncJobId, SyncJobScheduleConfig>
}

const FREQUENCY_IDS = new Set<string>(
  SYNC_SCHEDULE_FREQUENCIES.map((f) => f.id),
)

export function isSyncScheduleFrequencyId(
  value: string,
): value is SyncScheduleFrequencyId {
  return FREQUENCY_IDS.has(value)
}

export function frequencyLabel(id: SyncScheduleFrequencyId): string {
  return (
    SYNC_SCHEDULE_FREQUENCIES.find((f) => f.id === id)?.label ?? id
  )
}

export function frequencyIntervalMs(
  id: SyncScheduleFrequencyId,
): number | null {
  return (
    SYNC_SCHEDULE_FREQUENCIES.find((f) => f.id === id)?.intervalMs ?? null
  )
}

/** HH:MM 24h. */
export function isValidStartTimeEt(value: string): boolean {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  return Boolean(m)
}

export function normalizeStartTimeEt(value: string): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!m) return null
  return `${m[1]!.padStart(2, '0')}:${m[2]}`
}

export function parseStartTimeEt(value: string): {
  hour: number
  minute: number
} {
  const normalized = normalizeStartTimeEt(value) ?? '05:00'
  const [h, m] = normalized.split(':').map(Number)
  return { hour: h ?? 5, minute: m ?? 0 }
}

/** Defaults match prior hard-coded cadences (Incremental every 30m, Full weekly Mon 5am ET, …). */
export function defaultSyncScheduleConfig(): SyncScheduleConfig {
  return {
    version: 1,
    order: [
      'full-resync',
      'incremental',
      'listing-scores',
      'stats-cache',
      'deal-of-the-day',
      'property-addresses',
      'zip-boundaries',
      'fomc-sync',
      'cpi-sync',
      'market-digest',
    ],
    jobs: {
      'full-resync': { frequency: 'weekly', startTimeEt: '05:00', weekdayEt: 1 },
      incremental: { frequency: '30m', startTimeEt: '00:00' },
      'listing-scores': { frequency: 'weekly', startTimeEt: '05:00', weekdayEt: 1 },
      'stats-cache': { frequency: '30m', startTimeEt: '00:00' },
      'deal-of-the-day': { frequency: 'weekly', startTimeEt: '05:00', weekdayEt: 1 },
      'property-addresses': {
        frequency: 'weekly',
        startTimeEt: '01:00',
        weekdayEt: 1,
      },
      'zip-boundaries': { frequency: 'monthly', startTimeEt: '06:00' },
      'fomc-sync': { frequency: 'event', startTimeEt: '15:15' },
      'cpi-sync': { frequency: 'event', startTimeEt: '09:15' },
      'market-digest': { frequency: 'weekly', startTimeEt: '08:00', weekdayEt: 1 },
    },
  }
}

export function orderNumberByJob(
  config: SyncScheduleConfig,
): Record<ScheduledSyncJobId, number> {
  const out = {} as Record<ScheduledSyncJobId, number>
  config.order.forEach((jobId, index) => {
    out[jobId] = index + 1
  })
  return out
}

/** Panel row id → order # (scheduled jobs only). */
export function orderNumberByRow(
  config: SyncScheduleConfig,
): Partial<Record<string, number>> {
  const byJob = orderNumberByJob(config)
  const out: Partial<Record<string, number>> = {}
  for (const jobId of SCHEDULED_SYNC_JOB_IDS) {
    out[jobId] = byJob[jobId]
  }
  return out
}

/**
 * Sync All client steps from Configure order.
 * Always appends publish-snapshot last (refresh finished / read snapshot).
 */
export function syncAllClientStepsFromConfig(
  config: SyncScheduleConfig,
): AdminSyncActionId[] {
  const steps: AdminSyncActionId[] = []
  for (const jobId of config.order) {
    if (isSyncAllActionableJob(jobId)) {
      steps.push(jobId)
    }
  }
  if (!steps.includes('publish-snapshot')) {
    steps.push('publish-snapshot')
  }
  return steps
}

function isSyncAllActionableJob(
  jobId: ScheduledSyncJobId,
): jobId is Extract<ScheduledSyncJobId, AdminSyncActionId> {
  return (
    jobId === 'full-resync' ||
    jobId === 'incremental' ||
    jobId === 'listing-scores' ||
    jobId === 'stats-cache' ||
    jobId === 'deal-of-the-day' ||
    jobId === 'property-addresses' ||
    jobId === 'zip-boundaries'
    // fomc-sync / cpi-sync / market-digest — not part of Sync all
  )
}

export function mergeSyncScheduleConfig(
  raw: unknown,
): SyncScheduleConfig {
  const defaults = defaultSyncScheduleConfig()
  if (!raw || typeof raw !== 'object') return defaults
  const parsed = raw as Partial<SyncScheduleConfig>
  const jobs = { ...defaults.jobs }
  if (parsed.jobs && typeof parsed.jobs === 'object') {
    for (const jobId of SCHEDULED_SYNC_JOB_IDS) {
      const row = parsed.jobs[jobId]
      if (!row || typeof row !== 'object') continue
      const frequency = row.frequency
      const startTimeEt = normalizeStartTimeEt(String(row.startTimeEt ?? ''))
      if (
        typeof frequency === 'string' &&
        isSyncScheduleFrequencyId(frequency) &&
        startTimeEt
      ) {
        const next: SyncJobScheduleConfig = { frequency, startTimeEt }
        if (isSyncScheduleWeekdayEt(row.weekdayEt)) {
          next.weekdayEt = row.weekdayEt
        } else if (frequency === 'weekly') {
          next.weekdayEt = resolveWeekdayEt(defaults.jobs[jobId])
        }
        jobs[jobId] = next
      }
    }
  }

  let order = defaults.order.slice()
  if (Array.isArray(parsed.order)) {
    const seen = new Set<ScheduledSyncJobId>()
    const next: ScheduledSyncJobId[] = []
    for (const id of parsed.order) {
      if (
        typeof id === 'string' &&
        (SCHEDULED_SYNC_JOB_IDS as readonly string[]).includes(id) &&
        !seen.has(id as ScheduledSyncJobId)
      ) {
        seen.add(id as ScheduledSyncJobId)
        next.push(id as ScheduledSyncJobId)
      }
    }
    for (const id of SCHEDULED_SYNC_JOB_IDS) {
      if (!seen.has(id)) next.push(id)
    }
    if (next.length === SCHEDULED_SYNC_JOB_IDS.length) order = next
  }

  return { version: 1, order, jobs }
}
