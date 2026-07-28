import 'server-only'

import {
  deleteSyncMetaDurable,
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { TMRE_TOWNS } from '@/lib/tmre-towns'
import {
  formatIncrementalSyncLiveStatus,
  INCREMENTAL_SYNC_LIVE_KEY,
  isIncrementalSyncLiveStale,
  parseIncrementalSyncLive,
  type IncrementalSyncLiveProgress,
} from '@/lib/incremental-sync-live-shared'

export type { IncrementalSyncLiveProgress }
export {
  formatIncrementalSyncLiveStatus,
  INCREMENTAL_SYNC_LIVE_KEY,
  isIncrementalSyncLiveStale,
  parseIncrementalSyncLive,
}

export function readIncrementalSyncLive(): IncrementalSyncLiveProgress | null {
  return parseIncrementalSyncLive(getSyncMeta(INCREMENTAL_SYNC_LIVE_KEY))
}

/**
 * Drop dead "Queued…" breadcrumbs so Dashboard Status cannot claim a worker is
 * starting when live.updatedAt is older than the worker budget.
 */
export async function clearIncrementalSyncLiveIfStale(
  nowMs = Date.now(),
): Promise<IncrementalSyncLiveProgress | null> {
  const live = readIncrementalSyncLive()
  if (!live) return null
  if (!isIncrementalSyncLiveStale(live, nowMs)) return live
  await clearIncrementalSyncLive()
  return null
}

export async function stampIncrementalSyncLive(
  progress: Omit<IncrementalSyncLiveProgress, 'updatedAt' | 'townCount'> & {
    townCount?: number
    updatedAt?: string
  },
): Promise<void> {
  const payload: IncrementalSyncLiveProgress = {
    phase: progress.phase,
    town: progress.town,
    townIndex: progress.townIndex,
    townCount: progress.townCount ?? TMRE_TOWNS.length,
    updatedAt: progress.updatedAt ?? new Date().toISOString(),
  }
  await setSyncMetaDurable(INCREMENTAL_SYNC_LIVE_KEY, JSON.stringify(payload))
}

export async function clearIncrementalSyncLive(): Promise<void> {
  await deleteSyncMetaDurable(INCREMENTAL_SYNC_LIVE_KEY)
}
