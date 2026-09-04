import type { AdminSyncPanelRowId } from '@/lib/admin-sync-schedule-format'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'

/**
 * Admin sync table row → pause job.
 * Latest MLS is a derived status row only — it must NOT share Incremental's
 * pause flag (that silently stopped cron while Admin Sync now still worked).
 */
export const SCHEDULED_SYNC_JOB_BY_ROW: Partial<
  Record<AdminSyncPanelRowId, ScheduledSyncJobId>
> = {
  'full-resync': 'full-resync',
  incremental: 'incremental',
  'listing-scores': 'listing-scores',
  'edge-scores': 'edge-scores',
  'stats-cache': 'stats-cache',
  'deal-of-the-day': 'deal-of-the-day',
  'property-addresses': 'property-addresses',
  'vision-addresses': 'vision-addresses',
  'zip-boundaries': 'zip-boundaries',
  'open-houses': 'open-houses',
  'fomc-sync': 'fomc-sync',
  'cpi-sync': 'cpi-sync',
  'market-digest': 'market-digest',
  'cama-tax': 'cama-tax',
}
