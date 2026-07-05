import {
  VINTAGE_BUCKETS,
  classifyYearBuilt,
  type VintageBucketId,
} from '@/lib/vintage-buckets'

/** Inclusive index range over {@link VINTAGE_BUCKETS} (0 = Pre-1900 … 6 = 2020–present). */
export const VINTAGE_FILTER_MAX = VINTAGE_BUCKETS.length - 1

export type VintageIndexFilter = "0" | "1" | "2" | "3" | "4" | "5" | "6"

export const VINTAGE_INDEX_VALUES: readonly VintageIndexFilter[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
]

export function vintageBucketFilterIndex(
  id: VintageBucketId,
): number | null {
  if (id === 'unknown') return null
  const idx = VINTAGE_BUCKETS.findIndex((bucket) => bucket.id === id)
  return idx >= 0 ? idx : null
}

export function vintageFilterIndexToBucketId(index: number): VintageBucketId {
  const clamped = Math.min(Math.max(0, index), VINTAGE_FILTER_MAX)
  return VINTAGE_BUCKETS[clamped]!.id
}

export function vintageFilterActive(min: number, max: number): boolean {
  return min > 0 || max < VINTAGE_FILTER_MAX
}

export function listingMatchesVintageFilter(
  yearBuilt: number | null | undefined,
  minIndex: number,
  maxIndex: number,
): boolean {
  if (!vintageFilterActive(minIndex, maxIndex)) return true
  const bucketIndex = vintageBucketFilterIndex(classifyYearBuilt(yearBuilt))
  if (bucketIndex == null) return false
  const lo = Math.min(minIndex, maxIndex)
  const hi = Math.max(minIndex, maxIndex)
  return bucketIndex >= lo && bucketIndex <= hi
}

export function formatVintageRangeLabel(min: number, max: number): string {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (lo <= 0 && hi >= VINTAGE_FILTER_MAX) return 'Any Vintage'
  const loLabel = VINTAGE_BUCKETS[lo]?.label ?? '—'
  const hiLabel = VINTAGE_BUCKETS[hi]?.label ?? '—'
  if (lo === hi) return `${loLabel} Vintage`
  return `${loLabel} to ${hiLabel}`
}
