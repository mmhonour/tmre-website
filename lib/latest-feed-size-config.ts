import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  LATEST_FEED_SIZE_KEY,
  clampLatestFeedSize,
  parseLatestFeedSize,
} from '@/lib/latest-feed-size-shared'

export {
  LATEST_FEED_SIZE_KEY,
  LATEST_FEED_SIZE_DEFAULT,
  LATEST_FEED_SIZE_MIN,
  LATEST_FEED_SIZE_MAX,
  clampLatestFeedSize,
} from '@/lib/latest-feed-size-shared'

/**
 * Synchronous read from the in-process sync_meta cache. Fine in a warm Node
 * process that hydrated at boot; on a cold Lambda prefer the fresh read.
 */
export function getLatestFeedSize(): number {
  return parseLatestFeedSize(getSyncMeta(LATEST_FEED_SIZE_KEY))
}

/** Authoritative size from Postgres — shared across every Lambda. */
export async function getLatestFeedSizeFresh(): Promise<number> {
  try {
    return parseLatestFeedSize(await getSyncMetaFresh(LATEST_FEED_SIZE_KEY))
  } catch {
    return getLatestFeedSize()
  }
}

/** Persist a new size (durable) and return the clamped value applied. */
export async function setLatestFeedSize(value: number): Promise<number> {
  const clamped = clampLatestFeedSize(value)
  await setSyncMetaDurable(LATEST_FEED_SIZE_KEY, String(clamped))
  return clamped
}
