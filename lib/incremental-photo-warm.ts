import 'server-only'

import {
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { warmListingShowcasePhotos } from '@/lib/listing-photos-sync'
import {
  INCREMENTAL_PHOTO_WARM_DRAIN_BATCH,
  INCREMENTAL_PHOTO_WARM_QUEUE_CAP,
  mergeIncrementalPhotoWarmQueue,
} from '@/lib/incremental-photo-warm-shared'

export const INCREMENTAL_PHOTO_WARM_QUEUE_KEY = 'incremental_photo_warm_queue'
export {
  INCREMENTAL_PHOTO_WARM_DRAIN_BATCH,
  INCREMENTAL_PHOTO_WARM_QUEUE_CAP,
  mergeIncrementalPhotoWarmQueue,
}

type QueuePayload = {
  ids: string[]
  updatedAt: string
}

function parseQueue(raw: string | null): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as QueuePayload | string[]
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string')
    }
    if (parsed && Array.isArray(parsed.ids)) {
      return parsed.ids.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    /* ignore corrupt meta */
  }
  return []
}

async function writeQueue(ids: string[]): Promise<void> {
  const payload: QueuePayload = {
    ids,
    updatedAt: new Date().toISOString(),
  }
  await setSyncMetaDurable(INCREMENTAL_PHOTO_WARM_QUEUE_KEY, JSON.stringify(payload))
}

/** Lane 1 / incremental upsert — store MLS ids only. No Media fetch here. */
export async function enqueueIncrementalPhotoWarm(
  incoming: readonly string[],
): Promise<number> {
  const next = mergeIncrementalPhotoWarmQueue(
    parseQueue(getSyncMeta(INCREMENTAL_PHOTO_WARM_QUEUE_KEY)),
    incoming,
  )
  await writeQueue(next)
  return next.length
}

/**
 * Lane 3 — pull the same first six full-size photos a showcase open would.
 * Railway must not call this; it is Media CDN work.
 */
export async function drainIncrementalPhotoWarm(): Promise<{
  attempted: number
  warmed: number
  remaining: number
}> {
  const queued = parseQueue(getSyncMeta(INCREMENTAL_PHOTO_WARM_QUEUE_KEY))
  if (queued.length === 0) {
    return { attempted: 0, warmed: 0, remaining: 0 }
  }

  const batch = queued.slice(0, INCREMENTAL_PHOTO_WARM_DRAIN_BATCH)
  const leftover = queued.slice(batch.length)
  await writeQueue(leftover)

  let warmed = 0
  for (const mlsId of batch) {
    try {
      const { listing } = await readListingFromDbByMlsId(mlsId)
      if (!listing) continue
      const stored = await warmListingShowcasePhotos(listing)
      if (stored > 0) warmed += 1
    } catch (err) {
      console.warn(
        `[incremental-photo-warm] ${mlsId} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return { attempted: batch.length, warmed, remaining: leftover.length }
}
