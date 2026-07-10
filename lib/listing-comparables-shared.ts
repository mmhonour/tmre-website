import type { VintageBucketId } from '@/lib/vintage-buckets'

export type ComparableListing = {
  mlsId: string
  listingKey: string
  address: string
  city: string | null
  zip: string | null
  price: number | null
  closePrice: number | null
  closeDate: string | null
  beds: number | null
  baths: number | null
  lotAcres: number | null
  sqft: number | null
  vintageBucket: VintageBucketId
  vintageLabel: string
  yearBuilt: number | null
  pricePerSqft: number | null
  dom: number | null
  photoCount: number | null
  latitude: number | null
  longitude: number | null
  /** Location premium multiplier (water, center, golf) for If weighting. */
  locationPremiumMultiplier: number
  /** Goldilocks composite (0–100), same model as Intelligence. */
  goldilocksScore?: number | null
  /** Weekly metadata edge score (0–100), comparable across listings. */
  edgeScore?: number | null
}

export type ComparablesCriteria = {
  zip: string
  beds: number
  baths: number
  lotAcres: number | null
  vintageBucket: VintageBucketId
  vintageLabel: string
}

export type ComparablesResult = {
  sold: ComparableListing[]
  active: ComparableListing[]
  criteria: ComparablesCriteria | null
  /** Human-readable gaps when the subject lacks required match fields. */
  missingCriteria: string[]
}

/** Max sold/rented and on-market comps returned per side. */
export const COMPARABLES_MATCH_LIMIT = 12

export function fmtAcres(acres: number | null | undefined): string {
  if (acres == null || acres <= 0) return '—'
  if (acres < 0.01) return '<0.01 ac'
  if (acres < 10) return `${acres.toFixed(2)} ac`
  return `${acres.toFixed(1)} ac`
}

export function fmtSqft(sqft: number | null | undefined): string {
  if (sqft == null || sqft <= 0) return '—'
  return `${sqft.toLocaleString('en-US')} sqft`
}

export function fmtYearBuilt(yearBuilt: number | null | undefined): string | null {
  if (yearBuilt == null) return null
  return `Built ${yearBuilt}`
}

export function fmtPricePerSqft(
  pricePerSqft: number | null | undefined,
): string | null {
  if (pricePerSqft == null || pricePerSqft <= 0) return null
  return `$${Math.round(pricePerSqft)}/sqft`
}
