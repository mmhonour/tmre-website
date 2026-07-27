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
  parseIncrementalSyncLive,
  type IncrementalSyncLiveProgress,
} from '@/lib/incremental-sync-live-shared'

export type { IncrementalSyncLiveProgress }
export {
  formatIncrementalSyncLiveStatus,
  INCREMENTAL_SYNC_LIVE_KEY,
  parseIncrementalSyncLive,
}

export function readIncrementalSyncLive(): IncrementalSyncLiveProgress | null {
  return parseIncrementalSyncLive(getSyncMeta(INCREMENTAL_SYNC_LIVE_KEY))
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
