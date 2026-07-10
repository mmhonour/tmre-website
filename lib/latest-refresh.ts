/** Latest page + incremental MLS sync cadence (aligned with photo TTL). */
export const LATEST_DB_REFRESH_MS = 30 * 60 * 1000

/**
 * Bounded warm: max new hero thumbnails downloaded from RETS per 30-min cycle.
 * Listings already in listing-photos.db do not count toward this cap.
 */
export const LATEST_HERO_WARM_MAX_FETCHES_PER_CYCLE = 48

/** Parallel RETS hero downloads during bounded warm (keeps Node responsive). */
export const LATEST_HERO_WARM_CONCURRENCY = 2
