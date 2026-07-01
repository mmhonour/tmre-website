export type PriceBucketId =
  | '0-500k'
  | '500k-1.249m'
  | '1.5m-2.25m'
  | '2.25m-3m'
  | '3m-4m'
  | '4m-6m'
  | '6m-10m'
  | '10m-plus'
  | 'unknown'

export type PriceBucket = {
  id: PriceBucketId
  label: string
  min: number
  max: number | null
}

/** Closed-sale price tiers for Stats charts. */
export const PRICE_BUCKETS: PriceBucket[] = [
  { id: '0-500k', label: '$0–$499.99K', min: 0, max: 499_999 },
  { id: '500k-1.249m', label: '$500K–$1.249M', min: 500_000, max: 1_249_999 },
  // $1.25M–$1.5M rolls into $1.5M–$2.25M so tiers stay contiguous.
  { id: '1.5m-2.25m', label: '$1.5M–$2.25M', min: 1_250_000, max: 2_249_999 },
  { id: '2.25m-3m', label: '$2.25M–$3M', min: 2_250_000, max: 2_999_999 },
  { id: '3m-4m', label: '$3M–$4M', min: 3_000_000, max: 3_999_999 },
  { id: '4m-6m', label: '$4M–$6M', min: 4_000_000, max: 5_999_999 },
  { id: '6m-10m', label: '$6M–$10M', min: 6_000_000, max: 9_999_999 },
  { id: '10m-plus', label: '$10M+', min: 10_000_000, max: null },
]

export function classifySalePrice(price: number | null | undefined): PriceBucketId {
  if (price == null || !Number.isFinite(price) || price <= 0) return 'unknown'
  for (const bucket of PRICE_BUCKETS) {
    if (price < bucket.min) continue
    if (bucket.max == null || price <= bucket.max) return bucket.id
  }
  return 'unknown'
}

export function emptyPriceCounts(): Record<PriceBucketId, number> {
  return {
    '0-500k': 0,
    '500k-1.249m': 0,
    '1.5m-2.25m': 0,
    '2.25m-3m': 0,
    '3m-4m': 0,
    '4m-6m': 0,
    '6m-10m': 0,
    '10m-plus': 0,
    unknown: 0,
  }
}
