/** SmartMLS photo blobs refresh on this interval (30 minutes). */
export const LISTING_PHOTO_TTL_MS = 30 * 60 * 1000

export function listingPhotoSyncedAfter(ttlMs = LISTING_PHOTO_TTL_MS): string {
  return new Date(Date.now() - ttlMs).toISOString()
}

export function isListingPhotoFresh(
  syncedAt: string | null | undefined,
  ttlMs = LISTING_PHOTO_TTL_MS,
): boolean {
  if (!syncedAt) return false
  const ms = Date.parse(syncedAt)
  if (Number.isNaN(ms)) return false
  return Date.now() - ms < ttlMs
}
