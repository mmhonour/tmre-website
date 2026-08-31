/**
 * How many rows /latest renders. Client-safe half — no DB imports.
 *
 * This number has caused more confusion than any other on the page. A listing
 * can be in Neon, current, and feed-eligible, and still be invisible simply
 * because more than this many events happened after it. Nothing looks broken
 * from the page, which is why the size belongs in Admin next to the badge rules
 * that decide eligibility, rather than buried as a constant.
 */

export const LATEST_FEED_SIZE_KEY = 'latest_feed_size'

/** Unchanged from the constant this replaced — raising it is a deliberate act. */
export const LATEST_FEED_SIZE_DEFAULT = 30

export const LATEST_FEED_SIZE_MIN = 10

/**
 * The cache read already slices to 250, and the feed builder pulls at most 400
 * candidate rows before filtering, so beyond this the number stops meaning
 * anything.
 */
export const LATEST_FEED_SIZE_MAX = 250

export function clampLatestFeedSize(value: number): number {
  if (!Number.isFinite(value)) return LATEST_FEED_SIZE_DEFAULT
  return Math.max(
    LATEST_FEED_SIZE_MIN,
    Math.min(LATEST_FEED_SIZE_MAX, Math.round(value)),
  )
}

export function parseLatestFeedSize(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return LATEST_FEED_SIZE_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed)
    ? clampLatestFeedSize(parsed)
    : LATEST_FEED_SIZE_DEFAULT
}
