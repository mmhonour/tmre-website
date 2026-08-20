import 'server-only'

import type { AdminSyncActionId } from '@/lib/admin-sync-types'
import { deleteSyncMetaDurable, hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import {
  forceClearListingsRefreshLock,
  readListingsRefreshStatus,
} from '@/lib/listings-refresh-status'
import { INCREMENTAL_SYNC_LIVE_KEY } from '@/lib/incremental-sync-live-shared'
import { INCREMENTAL_STEP_LOG_KEY } from '@/lib/incremental-sync-step-log'
import {
  INCREMENTAL_UPSERT_HISTORY_KEY,
  LAST_INCREMENTAL_UPSERT_STATS_KEY,
} from '@/lib/incremental-upsert-stats'
import { STATS_CACHE_LAST_RUN_KEY } from '@/lib/stats-dirty-towns'

const STATS_CACHE_REBUILD_LOCK_KEY = 'stats_cache_rebuild_lock'
const STATS_CACHE_REBUILD_HEARTBEAT_KEY = 'stats_cache_rebuild_heartbeat'
const STATS_CACHE_QUEUE_BACKOFF_KEY = 'stats_cache_queue_backoff_until'

/**
 * Dashboard clocks + locks per Sync job. Does not delete listings or cache
 * payloads — only the stamps the row reads so the next Sync now is visible.
 */
const RESET_KEYS: Record<AdminSyncActionId, readonly string[]> = {
  incremental: [
    'last_incremental_sync',
    'last_incremental_sync_started',
    INCREMENTAL_SYNC_LIVE_KEY,
    INCREMENTAL_STEP_LOG_KEY,
    LAST_INCREMENTAL_UPSERT_STATS_KEY,
    INCREMENTAL_UPSERT_HISTORY_KEY,
  ],
  'listing-scores': [
    'last_listing_scores',
    'last_listing_scores_started',
  ],
  'edge-scores': ['last_listing_edge_scores'],
  'publish-snapshot': [
    'last_refresh_started_at',
    'last_refresh_finished_at',
  ],
  'stats-cache': [
    'last_stats_cache',
    'last_stats_cache_started',
    STATS_CACHE_LAST_RUN_KEY,
    STATS_CACHE_REBUILD_LOCK_KEY,
    STATS_CACHE_REBUILD_HEARTBEAT_KEY,
    STATS_CACHE_QUEUE_BACKOFF_KEY,
  ],
  'deal-of-the-day': [
    'last_deal_of_the_day_cache',
    'last_deal_of_the_day_cache_started',
  ],
  'property-addresses': ['property_addresses_synced_at'],
  'vision-addresses': [
    'vision_addresses_synced_at',
    'vision_addresses_live',
  ],
  'zip-boundaries': [
    'last_zip_boundaries_sync',
    'last_zip_boundaries_sync_started',
  ],
  'fomc-sync': ['fomc_last_synced_at'],
  'cpi-sync': ['cpi_last_synced_at'],
  'market-digest': ['market_digest_last_sent_at'],
  'full-resync': ['last_full_sync', 'last_full_sync_started'],
}

/** Global refresh lock sources that belong to this job. */
const REFRESH_HOLDERS: Partial<Record<AdminSyncActionId, readonly string[]>> = {
  incremental: ['incremental'],
  'stats-cache': ['stats-cache'],
  'full-resync': ['full-sync', 'full-sync-chunked'],
  'publish-snapshot': [
    'incremental',
    'stats-cache',
    'full-sync',
    'full-sync-chunked',
    'refresh',
    'unknown',
  ],
}

export type AdminSyncResetResult = {
  action: AdminSyncActionId
  cleared: string[]
  releasedRefreshLock: boolean
}

/** Wipe dashboard stamps and this job's locks. Leaves cache/listing data. */
export async function resetAdminSyncJobState(
  action: AdminSyncActionId,
): Promise<AdminSyncResetResult> {
  await hydrateSyncMetaStore()
  const keys = RESET_KEYS[action] ?? []
  const cleared: string[] = []
  for (const key of keys) {
    await deleteSyncMetaDurable(key)
    cleared.push(key)
  }

  let releasedRefreshLock = false
  const holders = REFRESH_HOLDERS[action]
  if (holders) {
    const refresh = readListingsRefreshStatus()
    const holder = refresh.refreshingKind?.trim() || 'unknown'
    if (refresh.refreshing && holders.includes(holder)) {
      forceClearListingsRefreshLock()
      releasedRefreshLock = true
    }
  }

  return { action, cleared, releasedRefreshLock }
}
