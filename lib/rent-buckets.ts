export type RentBucketId =
  | '0-2k'
  | '2k-4k'
  | '4k-6k'
  | '6k-8k'
  | '8k-12k'
  | '12k-plus'
  | 'unknown'

export type RentBucket = {
  id: RentBucketId
  label: string
  min: number
  max: number | null
}

/** Closed-lease monthly rent tiers for Stats rental view. */
export const RENT_BUCKETS: RentBucket[] = [
  { id: '0-2k', label: '$0–$1,999/mo', min: 0, max: 1_999 },
  { id: '2k-4k', label: '$2K–$3,999/mo', min: 2_000, max: 3_999 },
  { id: '4k-6k', label: '$4K–$5,999/mo', min: 4_000, max: 5_999 },
  { id: '6k-8k', label: '$6K–$7,999/mo', min: 6_000, max: 7_999 },
  { id: '8k-12k', label: '$8K–$11,999/mo', min: 8_000, max: 11_999 },
  { id: '12k-plus', label: '$12K+/mo', min: 12_000, max: null },
]

export function classifyRentPrice(price: number | null | undefined): RentBucketId {
  if (price == null || !Number.isFinite(price) || price <= 0) return 'unknown'
  for (const bucket of RENT_BUCKETS) {
    if (price < bucket.min) continue
    if (bucket.max == null || price <= bucket.max) return bucket.id
  }
  return 'unknown'
}

export function emptyRentCounts(): Record<RentBucketId, number> {
  return {
    '0-2k': 0,
    '2k-4k': 0,
    '4k-6k': 0,
    '6k-8k': 0,
    '8k-12k': 0,
    '12k-plus': 0,
    unknown: 0,
  }
}
