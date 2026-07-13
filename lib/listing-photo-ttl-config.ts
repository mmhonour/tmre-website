import 'server-only'

import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { LISTING_PHOTO_TTL_MS } from '@/lib/listing-photo-ttl'

/**
 * Admin-tunable listing-photo warm TTL.
 *
 * This is an APPLICATION freshness policy, NOT an R2 lifecycle rule: it only
 * controls how long the WARM/sync path treats a stored photo as fresh before
 * re-pulling it from RETS. It has no effect on reads (public photo requests
 * always serve whatever is in R2) and never deletes anything from R2.
 *
 * Longer TTL ⇒ the full/incremental sync stops re-fetching unchanged photos
 * from the MLS (less RETS egress). MLS photos for a given listing rarely change,
 * so a multi-day TTL is safe and is the recommended setting now that photos live
 * in durable object storage. Stored in `sync_meta`, no redeploy needed.
 */

export const LISTING_PHOTO_TTL_MINUTES_KEY = 'listing_photo_ttl_minutes'
export const LISTING_PHOTO_TTL_MINUTES_DEFAULT = Math.round(
  LISTING_PHOTO_TTL_MS / 60_000,
)
export const LISTING_PHOTO_TTL_MINUTES_MIN = 5
// 90 days — effectively "don't re-pull unless deliberately cache-busted".
export const LISTING_PHOTO_TTL_MINUTES_MAX = 90 * 24 * 60

export function clampTtlMinutes(value: number): number {
  if (!Number.isFinite(value)) return LISTING_PHOTO_TTL_MINUTES_DEFAULT
  return Math.max(
    LISTING_PHOTO_TTL_MINUTES_MIN,
    Math.min(LISTING_PHOTO_TTL_MINUTES_MAX, Math.round(value)),
  )
}

/** Configured warm TTL in minutes (synchronous, cached). */
export function getListingPhotoTtlMinutes(): number {
  const raw = getSyncMeta(LISTING_PHOTO_TTL_MINUTES_KEY)
  if (raw == null) return LISTING_PHOTO_TTL_MINUTES_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed)
    ? clampTtlMinutes(parsed)
    : LISTING_PHOTO_TTL_MINUTES_DEFAULT
}

/** Configured warm TTL in milliseconds (synchronous, cached). */
export function getListingPhotoTtlMs(): number {
  return getListingPhotoTtlMinutes() * 60_000
}

/** Persist a new TTL (durable) and return the clamped minutes applied. */
export async function setListingPhotoTtlMinutes(value: number): Promise<number> {
  const clamped = clampTtlMinutes(value)
  await setSyncMetaDurable(LISTING_PHOTO_TTL_MINUTES_KEY, String(clamped))
  return clamped
}
