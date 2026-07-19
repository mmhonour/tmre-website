import type { AdminSyncPanelRowId } from '@/lib/admin-sync-schedule-format'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'

/**
 * Admin sync table row → pause job. Rows that share a schedule (e.g. Latest MLS
 * and Incremental) share one pause flag.
 */
export const SCHEDULED_SYNC_JOB_BY_ROW: Partial<
  Record<AdminSyncPanelRowId, ScheduledSyncJobId>
> = {
  'full-resync': 'full-resync',
  incremental: 'incremental',
  'latest-mls': 'incremental',
  'listing-scores': 'listing-scores',
  'stats-cache': 'stats-cache',
  'deal-of-the-day': 'deal-of-the-day',
  'property-addresses': 'property-addresses',
  'zip-boundaries': 'zip-boundaries',
}
