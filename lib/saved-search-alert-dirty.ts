import 'server-only'

import {
  deleteSyncMetaDurable,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { getSyncMeta } from '@/lib/db/sync-meta'
import { SYNC_QUEUE_PRIORITY_MANUAL } from '@/lib/sync-queue-shared'
import type { AlertJobKind } from '@/lib/saved-search-alert-kinds'

export const ALERTS_LISTING_DIRTY_KEY = 'alerts_listing_dirty'
export const ALERTS_OPEN_HOUSE_DIRTY_KEY = 'alerts_open_house_dirty'
export const LAST_ALERTS_JOB_KEY = 'last_alerts'

export type AlertDirtyState = {
  listing: string | null
  openHouse: string | null
}

export async function markListingAlertsDirty(): Promise<void> {
  await setSyncMetaDurable(ALERTS_LISTING_DIRTY_KEY, new Date().toISOString())
}

export async function markOpenHouseAlertsDirty(): Promise<void> {
  await setSyncMetaDurable(ALERTS_OPEN_HOUSE_DIRTY_KEY, new Date().toISOString())
}

export async function clearListingAlertsDirty(): Promise<void> {
  await deleteSyncMetaDurable(ALERTS_LISTING_DIRTY_KEY)
}

export async function clearOpenHouseAlertsDirty(): Promise<void> {
  await deleteSyncMetaDurable(ALERTS_OPEN_HOUSE_DIRTY_KEY)
}

export async function readAlertDirtyState(): Promise<AlertDirtyState> {
  const [listing, openHouse] = await Promise.all([
    getSyncMeta(ALERTS_LISTING_DIRTY_KEY),
    getSyncMeta(ALERTS_OPEN_HOUSE_DIRTY_KEY),
  ])
  return { listing, openHouse }
}

export async function alertsJobHasDirty(): Promise<boolean> {
  const dirty = await readAlertDirtyState()
  return Boolean(dirty.listing || dirty.openHouse)
}

/** Incremental / OH / Admin: ring the Railway alerts job now. */
export async function enqueueAlertsJob(opts: {
  trigger: string
  force?: boolean
  kinds?: AlertJobKind[]
}): Promise<{ ok: boolean; reason?: string }> {
  const { enqueueSyncJob } = await import('@/lib/sync-queue')
  const payload: Record<string, unknown> = {}
  if (opts.force === true) payload.force = true
  if (opts.kinds?.length) payload.kinds = opts.kinds
  const result = await enqueueSyncJob({
    jobId: 'alerts',
    trigger: opts.trigger,
    priority: SYNC_QUEUE_PRIORITY_MANUAL,
    ignoreCooldown: true,
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  })
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? 'enqueue failed' }
  }
  return {
    ok: true,
    reason: result.enqueued
      ? 'queued'
      : result.alreadyRunning
        ? 'already running'
        : result.alreadyQueued
          ? 'already queued'
          : result.reason ?? undefined,
  }
}
