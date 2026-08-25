import type { TmreTown } from '@/lib/tmre-towns'

/** Shared client/server shapes for DOTD carousel + FSSR seed. */

export type DealCarouselListing = {
  mlsId: string
  listingKey?: string
  status?: string | null
  raw?: Record<string, string> | null
  propertyType?: string
  style?: string
  address: { street: string; city: string; state?: string; full: string }
  price: number | null
  originalListPrice?: number | null
  beds: number | null
  baths: number | null
  sqft?: number | null
  yearBuilt?: number | null
  dom: number | null
  listDate?: string | null
  photoCount?: number | null
  schools?: {
    elementary: string | null
    middle: string | null
    high: string | null
    district: string | null
  }
}

export type DealCarouselScore = {
  age: number
  condition: number
  finishesQuality: number
  pricePerSqftFit: number
  layoutQuality: number
  schoolRating: number
  composite: number
  weights: {
    age: number
    condition: number
    finishes: number
    ppsf: number
    layout: number
    schools: number
  }
}

export type DealCarouselPayload = {
  score: DealCarouselScore
  photoUrl: string | null
  listing: DealCarouselListing
  insight?: string
  totalReviewed?: number
  qualifiedCount?: number
  kind?: 'sale' | 'rental'
  pricePerSqft?: number | null
  cityMedianPricePerSqft?: number | null
  cityMedianPrice?: number | null
  valueDiscountPct?: number | null
  lotAcres?: number | null
  superlatives?: string[]
  pickMode?: 'below-median' | 'board-top' | 'value-aesthetic'
}

export type DealCarouselDealsByTown = Partial<
  Record<TmreTown, DealCarouselPayload | null>
>

/** `all` = any subtype (used for Rentals on DOTD when subtype pills are hidden). */
export type DealPropertyClassFilter = 'homes' | 'multi' | 'condos' | 'all'
export type DealTransactionFilter = 'all' | 'sale' | 'rental'
