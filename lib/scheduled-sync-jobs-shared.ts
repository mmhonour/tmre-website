/** Shared scheduled-sync pause job ids (safe for client + server). */

export const SCHEDULED_SYNC_JOB_IDS = [
  'full-resync',
  'incremental',
  'listing-scores',
  'edge-scores',
  'stats-cache',
  'deal-of-the-day',
  'property-addresses',
  'vision-addresses',
  'zip-boundaries',
  'open-houses',
  'fomc-sync',
  'cpi-sync',
  'market-digest',
  'cama-tax',
] as const

export type ScheduledSyncJobId = (typeof SCHEDULED_SYNC_JOB_IDS)[number]

/**
 * Full resync replaces each town/status bucket and deletes MLS rows RETS no
 * longer returns — that drops older Closed/Expired history. Hidden from Admin
 * and schedules. Code stays as a CLI stub (`npm run sync:listings` +
 * FULL_RESYNC_CONFIRM=1).
 */
export const FULL_RESYNC_RETIRED = true

export function isFullResyncRetired(): boolean {
  return FULL_RESYNC_RETIRED
}

export function isRetiredScheduledSyncJob(id: string): boolean {
  return FULL_RESYNC_RETIRED && id === 'full-resync'
}

export const FULL_RESYNC_RETIRED_MESSAGE =
  'Full resync is retired — bucket replace would delete listings RETS no longer returns. Use Incremental. Emergency CLI: npm run sync:listings with FULL_RESYNC_CONFIRM=1.'

export type ScheduledSyncPausedJobs = Record<ScheduledSyncJobId, boolean>

export function isScheduledSyncJobId(value: string): value is ScheduledSyncJobId {
  return (SCHEDULED_SYNC_JOB_IDS as readonly string[]).includes(value)
}

export function emptyScheduledSyncPausedJobs(): ScheduledSyncPausedJobs {
  return {
    'full-resync': false,
    incremental: false,
    'listing-scores': false,
    'edge-scores': false,
    'stats-cache': false,
    'deal-of-the-day': false,
    'property-addresses': false,
    'vision-addresses': false,
    'zip-boundaries': false,
    'open-houses': false,
    'fomc-sync': false,
    'cpi-sync': false,
    'market-digest': false,
    'cama-tax': false,
  }
}
