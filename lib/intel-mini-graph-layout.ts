/**
 * Shared layout helpers for Intelligence mini-graphs (price / vintage / luxury).
 *
 * When only a few buckets have data, empty bands otherwise pin the real points
 * to one side of the sparkline. Collapse to the non-empty set (2–3 points) and
 * space them evenly; a single point stays centered.
 *
 * Never invent synthetic midpoints — counts must match real listings behind a click.
 */

export const INTEL_MINI_GRAPH_WIDTH = 248
export const INTEL_MINI_GRAPH_PAD_X = 14

/** Max non-empty buckets that trigger sparse equal-spacing (exclusive of 1). */
export const INTEL_MINI_GRAPH_SPARSE_MAX = 3

type MiniGraphBucketBase = {
  count: number
  id: string
  label: string
}

/**
 * If 2–3 buckets have count > 0, return only those so they can spread across
 * the chart. Otherwise keep the full band list (distribution context).
 * A single non-empty bucket is kept alone (centered by {@link miniGraphPointX}).
 */
export function selectMiniGraphBucketsForLayout<T extends MiniGraphBucketBase>(
  buckets: readonly T[],
): T[] {
  const withData = buckets.filter((b) => b.count > 0)
  if (withData.length === 0) return []
  if (withData.length <= INTEL_MINI_GRAPH_SPARSE_MAX) {
    return withData
  }
  return [...buckets]
}

/** Equal X across the plot; one point → center. */
export function miniGraphPointX(
  index: number,
  count: number,
  width = INTEL_MINI_GRAPH_WIDTH,
  padX = INTEL_MINI_GRAPH_PAD_X,
): number {
  if (count <= 1) return width / 2
  const innerW = width - padX * 2
  return padX + (innerW * index) / (count - 1)
}
