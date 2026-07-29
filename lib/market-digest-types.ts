import type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'

export type MarketDigestDealOfTheWeek = {
  mlsId: string
  address: string
  city: string | null
  price: number | null
  insight: string
  href: string
  photoUrl: string | null
  composite: number | null
  superlatives: string[]
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  propertyType: string | null
  style: string | null
  valueDiscountPct: number | null
  lotAcres: number | null
}

export type MarketDigestCategorySlice = {
  id: MarketPulseCategoryId
  label: string
  /** Short scope for chart titles / footnote (e.g. "sales", "rentals"). */
  scopeLabel: string
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
}

export type MarketDigestSnapshot = {
  generatedAt: string
  /** ALL sales — used by Monday email and default Market Pulse tab. */
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  /** Market Pulse tabs (ALL / SFR / Condo / Rentals / Commercial). */
  categories: MarketDigestCategorySlice[]
  dealOfTheWeek: MarketDigestDealOfTheWeek | null
  socialProfiles: { label: string; handleOrUrl: string }[]
}
