/**
 * Shared layout helpers for Intelligence mini-graphs (price / vintage / luxury).
 *
 * When only a few buckets have data, empty bands otherwise pin the real points
 * to one side of the sparkline. Collapse to the non-empty set (2–3 points) and
 * space them evenly; a single point stays centered.
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

type PriceLikeBucket = MiniGraphBucketBase & {
  min: number
  max: number | null
}

function isPriceLikeBucket(b: MiniGraphBucketBase): b is PriceLikeBucket {
  return (
    "min" in b &&
    typeof (b as PriceLikeBucket).min === "number" &&
    "max" in b
  )
}

/**
 * When exactly two bands have inventory and more than two listings total,
 * insert a synthetic midpoint so the sparkline always has 3 vertices.
 * Skip when there are only two listings (nothing meaningful to interpolate).
 * Only applies to price-like buckets (min/max); DOM-day bands stay as-is.
 */
function withSyntheticMidIfNeeded<T extends MiniGraphBucketBase>(
  a: T,
  b: T,
): T[] {
  const total = a.count + b.count
  if (total <= 2) return [a, b]
  if (!isPriceLikeBucket(a) || !isPriceLikeBucket(b)) return [a, b]

  const midCount = Math.max(1, Math.round((a.count + b.count) / 2))
  const aHi = a.max ?? a.min
  const bLo = b.min
  const midMin = Math.min(aHi, bLo)
  const midMax = Math.max(aHi, bLo)
  const midVal =
    Number.isFinite(midMin) && Number.isFinite(midMax)
      ? (midMin + midMax) / 2
      : aHi

  const mid = {
    ...a,
    id: `${a.id}__mid__${b.id}`,
    label: formatMidBandLabel(midVal),
    count: midCount,
    min: midVal,
    max: midVal,
  } as T

  return [a, mid, b]
}

function formatMidBandLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    const text =
      m >= 10 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, "")
    return `$${text}M`
  }
  if (value >= 1_000) {
    const k = value / 1_000
    const text =
      k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "")
    return `$${text}K`
  }
  return `$${Math.round(value).toLocaleString()}`
}

/**
 * If 2–3 buckets have count > 0, return only those so they can spread across
 * the chart. With exactly 2 non-empty price bands and >2 listings, insert a
 * synthetic middle point. Otherwise keep the full band list (distribution context).
 * A single non-empty bucket is kept alone (centered by {@link miniGraphPointX}).
 */
export function selectMiniGraphBucketsForLayout<T extends MiniGraphBucketBase>(
  buckets: readonly T[],
): T[] {
  const withData = buckets.filter((b) => b.count > 0)
  if (withData.length >= 1 && withData.length <= INTEL_MINI_GRAPH_SPARSE_MAX) {
    if (withData.length === 2) {
      return withSyntheticMidIfNeeded(withData[0]!, withData[1]!)
    }
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
