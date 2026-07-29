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
  isIncrementalSyncQueuedDead,
  parseIncrementalSyncLive,
  type IncrementalSyncLiveProgress,
} from '@/lib/incremental-sync-live-shared'

export type { IncrementalSyncLiveProgress }
export {
  formatIncrementalSyncLiveStatus,
  INCREMENTAL_SYNC_LIVE_KEY,
  isIncrementalSyncLiveStale,
  isIncrementalSyncQueuedDead,
  parseIncrementalSyncLive,
}

export function readIncrementalSyncLive(): IncrementalSyncLiveProgress | null {
  return parseIncrementalSyncLive(getSyncMeta(INCREMENTAL_SYNC_LIVE_KEY))
}

/**
 * Drop dead "Queued…" breadcrumbs so Dashboard Status cannot claim a worker is
 * starting when the hop is older than the dead-queue / worker budget.
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

/**
 * Stamp live progress. Re-queue while already `queued` preserves the original
 * `queuedAt` so cron 202 acks cannot reset the stale clock every 30 minutes.
 */
export async function stampIncrementalSyncLive(
  progress: Omit<IncrementalSyncLiveProgress, 'updatedAt' | 'townCount' | 'queuedAt'> & {
    townCount?: number
    updatedAt?: string
    queuedAt?: string
  },
): Promise<void> {
  const existing = readIncrementalSyncLive()
  const nowIso = progress.updatedAt ?? new Date().toISOString()

  let queuedAt: string | undefined
  if (progress.phase === 'queued') {
    if (existing?.phase === 'queued') {
      // Keep first-queue time — do not let cron re-stamps look "fresh".
      queuedAt = existing.queuedAt || existing.updatedAt || progress.queuedAt || nowIso
    } else {
      queuedAt = progress.queuedAt ?? nowIso
    }
  }

  const payload: IncrementalSyncLiveProgress = {
    phase: progress.phase,
    town: progress.town,
    townIndex: progress.townIndex,
    townCount: progress.townCount ?? TMRE_TOWNS.length,
    // For re-queue of an already-queued hop, keep updatedAt = first queue too
    // so ageMs stays honest even if a reader ignores queuedAt.
    updatedAt:
      progress.phase === 'queued' && existing?.phase === 'queued'
        ? queuedAt ?? existing.updatedAt
        : nowIso,
    queuedAt,
  }
  await setSyncMetaDurable(INCREMENTAL_SYNC_LIVE_KEY, JSON.stringify(payload))
}

export async function clearIncrementalSyncLive(): Promise<void> {
  await deleteSyncMetaDurable(INCREMENTAL_SYNC_LIVE_KEY)
}
