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
    default:
      return 5 * 60_000
  }
}

export function isSyncNextOverrideJobId(value: string): value is SyncNextOverrideJobId {
  return (SCHEDULED_SYNC_JOB_IDS as readonly string[]).includes(value)
}
