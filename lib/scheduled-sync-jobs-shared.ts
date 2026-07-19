/** Shared scheduled-sync pause job ids (safe for client + server). */

export const SCHEDULED_SYNC_JOB_IDS = [
  'full-resync',
  'incremental',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
  'property-addresses',
  'zip-boundaries',
] as const

export type ScheduledSyncJobId = (typeof SCHEDULED_SYNC_JOB_IDS)[number]

export type ScheduledSyncPausedJobs = Record<ScheduledSyncJobId, boolean>

export function isScheduledSyncJobId(value: string): value is ScheduledSyncJobId {
  return (SCHEDULED_SYNC_JOB_IDS as readonly string[]).includes(value)
}

export function emptyScheduledSyncPausedJobs(): ScheduledSyncPausedJobs {
  return {
    'full-resync': false,
    incremental: false,
    'listing-scores': false,
    'stats-cache': false,
    'deal-of-the-day': false,
    'property-addresses': false,
    'zip-boundaries': false,
  }
}
