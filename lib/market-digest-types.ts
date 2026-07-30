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

/** Closed-sales total for one town over the trailing window. */
export type MarketDigestClosedTownCount = {
  city: string
  count: number
}

export type MarketDigestCategorySlice = {
  id: MarketPulseCategoryId
  label: string
  /** Short scope for chart titles / footnote (e.g. "sales", "rentals"). */
  scopeLabel: string
  /** Property type the visitor picked, for titles (e.g. "SFR", "condos"). */
  selectionLabel: string
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  /** Closed sales per town over `closedTrailingMonths` (empty when the query fails). */
  closedTrailing: MarketDigestClosedTownCount[]
  /** Featured deal for this tab (DOTW for ALL; DOTD-aligned for other types). */
  deal: MarketDigestDealOfTheWeek | null
}

/** Trailing window for the closed-sales-by-town chart (web + email). */
export const MARKET_DIGEST_CLOSED_TRAILING_MONTHS = 24

export type MarketDigestSnapshot = {
  generatedAt: string
  /** ALL sales — used by Monday email and default Market Pulse tab. */
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  /** ALL-sales closed totals per town over the trailing window. */
  closedTrailing: MarketDigestClosedTownCount[]
  /** Market Pulse tabs (ALL / SFR / Condo / Rentals / Commercial). */
  categories: MarketDigestCategorySlice[]
  dealOfTheWeek: MarketDigestDealOfTheWeek | null
  socialProfiles: { label: string; handleOrUrl: string }[]
}
