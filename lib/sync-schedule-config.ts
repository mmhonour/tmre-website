import 'server-only'

import {
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  cpiSyncDueRelease,
  fomcSyncDueMeeting,
} from '@/lib/fed-event-sync-schedule'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  mergeSyncScheduleConfig,
  resolveJobScheduler,
  type SyncScheduleConfig,
  type SyncSchedulerProvider,
} from '@/lib/sync-schedule-config-shared'
import {
  isJobDueBySchedule,
} from '@/lib/admin-sync-schedule'
import {
  isSyncNextOverrideDue,
  shouldDeferScheduledJob,
} from '@/lib/sync-next-override'

export const SYNC_SCHEDULE_CONFIG_KEY = 'sync_schedule_config'

export type {
  SyncJobScheduleConfig,
  SyncScheduleConfig,
  SyncScheduleFrequencyId,
  SyncScheduleWeekdayEt,
  SyncSchedulerProvider,
} from '@/lib/sync-schedule-config-shared'

export {
  SYNC_SCHEDULE_FREQUENCIES,
  SYNC_SCHEDULE_WEEKDAYS,
  SYNC_SCHEDULER_PROVIDERS,
  defaultSyncScheduleConfig,
  frequencyLabel,
  frequencyIntervalMs,
  isSyncScheduleFrequencyId,
  isSyncScheduleWeekdayEt,
  isSyncSchedulerProvider,
  isValidStartTimeEt,
  normalizeStartTimeEt,
  orderNumberByJob,
  orderNumberByRow,
  resolveJobScheduler,
  resolveWeekdayEt,
  schedulerProviderLabel,
  syncAllClientStepsFromConfig,
  mergeSyncScheduleConfig,
  parseStartTimeEt,
  weekdayEtLabel,
} from '@/lib/sync-schedule-config-shared'

function parseStoredConfig(raw: string | null | undefined): SyncScheduleConfig {
  if (!raw?.trim()) return mergeSyncScheduleConfig(null)
  try {
    return mergeSyncScheduleConfig(JSON.parse(raw) as unknown)
  } catch {
    return mergeSyncScheduleConfig(null)
  }
}

export function readSyncScheduleConfig(): SyncScheduleConfig {
  return parseStoredConfig(getSyncMeta(SYNC_SCHEDULE_CONFIG_KEY))
}

export async function readSyncScheduleConfigFresh(): Promise<SyncScheduleConfig> {
  return parseStoredConfig(await getSyncMetaFresh(SYNC_SCHEDULE_CONFIG_KEY))
}

export async function writeSyncScheduleConfig(
  config: SyncScheduleConfig,
): Promise<SyncScheduleConfig> {
  const merged = mergeSyncScheduleConfig(config)
  await setSyncMetaDurable(SYNC_SCHEDULE_CONFIG_KEY, JSON.stringify(merged))
  return merged
}

/** sync_meta key holding last successful finish for a scheduled job. */
export function lastFinishedMetaKey(jobId: ScheduledSyncJobId): string {
  switch (jobId) {
    case 'full-resync':
      return 'last_full_sync'
    case 'incremental':
      return 'last_incremental_sync'
    case 'listing-scores':
      return 'last_listing_scores'
    case 'edge-scores':
      return 'last_listing_edge_scores'
    case 'stats-cache':
      return 'last_stats_cache'
    case 'deal-of-the-day':
      return 'last_deal_of_the_day_cache'
    case 'property-addresses':
      return 'property_addresses_synced_at'
    case 'zip-boundaries':
      return 'last_zip_boundaries_sync'
    case 'fomc-sync':
      return 'fomc_last_synced_at'
    case 'cpi-sync':
      return 'cpi_last_synced_at'
    case 'market-digest':
      return 'market_digest_last_sent_at'
    default: {
      const _exhaustive: never = jobId
      return _exhaustive
    }
  }
}

export function readLastFinishedForScheduledJob(
  jobId: ScheduledSyncJobId,
): string | null {
  return getSyncMeta(lastFinishedMetaKey(jobId))
}

/**
 * True when thin cron / catch-up should run this job now
 * (respects Admin Next override + Configure frequency).
 */
export function isScheduledJobDue(
  jobId: ScheduledSyncJobId,
  now = new Date(),
  config = readSyncScheduleConfig(),
): boolean {
  if (shouldDeferScheduledJob(jobId, now)) return false
  if (isSyncNextOverrideDue(jobId, now)) return true

  if (jobId === 'fomc-sync' || jobId === 'cpi-sync') {
    const start =
      config.jobs[jobId]?.startTimeEt ??
      (jobId === 'fomc-sync' ? '15:15' : '09:15')
    if (jobId === 'fomc-sync') {
      return Boolean(
        fomcSyncDueMeeting(
          undefined,
          now,
          start,
          getSyncMeta('fomc_last_synced_event_id'),
        ),
      )
    }
    return Boolean(
      cpiSyncDueRelease(
        undefined,
        now,
        start,
        getSyncMeta('cpi_last_synced_event_id'),
      ),
    )
  }

  return isJobDueBySchedule(
    config.jobs[jobId],
    readLastFinishedForScheduledJob(jobId),
    now,
  )
}

/** Inverse helper for thin cron skip messages. */
export function shouldSkipScheduledJobNotDue(
  jobId: ScheduledSyncJobId,
  now = new Date(),
): boolean {
  return !isScheduledJobDue(jobId, now)
}

/**
 * Edge-score weekly rebuild due check (Sync 3b).
 * Own Configure job (`edge-scores`) + finish stamp `last_listing_edge_scores`.
 */
export function isListingEdgeScoresDue(
  now = new Date(),
  config = readSyncScheduleConfig(),
): boolean {
  return isScheduledJobDue('edge-scores', now, config)
}

export function shouldSkipListingEdgeScoresNotDue(now = new Date()): boolean {
  return !isListingEdgeScoresDue(now)
}

/**
 * True when this alarm clock must not start the job (Configure radio points
 * at another provider). Netlify thin crons pass `'netlify'`; EventBridge
 * ingress passes `'eventbridge'`. Railway mls-sync is never these callers —
 * when Scheduler is railway, both Netlify and EB skip.
 */
export function shouldSkipScheduledJobWrongProvider(
  jobId: ScheduledSyncJobId,
  caller: SyncSchedulerProvider,
  config = readSyncScheduleConfig(),
): boolean {
  return resolveJobScheduler(config.jobs[jobId]) !== caller
}

export async function shouldSkipScheduledJobWrongProviderFresh(
  jobId: ScheduledSyncJobId,
  caller: SyncSchedulerProvider,
): Promise<boolean> {
  const config = await readSyncScheduleConfigFresh()
  return resolveJobScheduler(config.jobs[jobId]) !== caller
}
