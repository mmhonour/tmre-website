/** Photo proxy `?size=` → store quality. Default is mid (card / list thumbs). */
export type ListingPhotoQuality = "display" | "full" | "mid";

/** R2/SQLite cache id suffix so mid bytes never overwrite gallery full. */
export const LISTING_PHOTO_CARD_CACHE_SUFFIX = "__card";

/**
 * Cached thumbs for index > 0 are often ~10–60KB. Full CDN MediaURL JPEGs are
 * typically much larger — use this floor so `size=full` does not reuse a thumb.
 */
export const FULL_QUALITY_MIN_BYTES = 80_000;

/**
 * MLS MediaMidsizeURL JPEGs are typically ~80–400KB. A 3MB MediaURL full must
 * not count as a mid/card hit (browser downscale of 3072px is what stripes
 * roofs and siding on Grid / Large cards).
 */
export const MID_QUALITY_MIN_BYTES = 4_000;
export const MID_QUALITY_MAX_BYTES = 1_200_000;

export function listingPhotoCardCacheId(cacheId: string): string {
  const id = cacheId.trim();
  if (!id) return "";
  if (id.endsWith(LISTING_PHOTO_CARD_CACHE_SUFFIX)) return id;
  return `${id}${LISTING_PHOTO_CARD_CACHE_SUFFIX}`;
}

export function listingPhotoQualityFromSizeParam(
  size: string | null,
): ListingPhotoQuality {
  if (size === "full") return "full";
  if (size === "display") return "display";
  return "mid";
}

export function cacheSatisfiesQuality(
  byteLength: number,
  quality: ListingPhotoQuality,
): boolean {
  if (quality === "full") return byteLength >= FULL_QUALITY_MIN_BYTES;
  if (quality === "mid") {
    return (
      byteLength >= MID_QUALITY_MIN_BYTES &&
      byteLength <= MID_QUALITY_MAX_BYTES
    );
  }
  return byteLength >= 100;
}
