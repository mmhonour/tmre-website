import type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'
import type { StatsValueCalc } from '@/lib/stats-compute'

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
  /** Cached at closed-by-town rebuild — not computed in the browser. */
  calc?: StatsValueCalc
}

/** Avg days on market for one town (from stats cache / active commercial DOM). */
export type MarketDigestDomTownCount = {
  city: string
  avgDaysOnMarket: number
  /** From market-stats cache (or commercial slice build). */
  avgDaysOnMarketCalc?: StatsValueCalc
}

/** Median / average price for one town (from market-stats cache). */
export type MarketDigestPriceTownCount = {
  city: string
  medianPrice: number | null
  averagePrice: number | null
  medianPriceCalc?: StatsValueCalc
  averagePriceCalc?: StatsValueCalc
  /** Close ÷ original ask as a percent, precomputed at stats rebuild. */
  saleToAskPct?: number | null
  /** Average dollar gap on the same pool (negative = closed under ask). */
  saleToAskDollars?: number | null
  /** Average minus median, cached at rebuild rather than subtracted on read. */
  priceDelta?: number | null
  priceDeltaPct?: number | null
  priceDeltaCalc?: StatsValueCalc
  saleToAskCalc?: StatsValueCalc
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
  /** Closed sales per town over the page-load lookback (12 mo). Empty when the query fails. */
  closedTrailing: MarketDigestClosedTownCount[]
  /** Avg DOM per town for the Market Pulse bar chart. */
  avgDomByTown: MarketDigestDomTownCount[]
  /** Median + average price per town (Market Pulse price bars). */
  priceByTown: MarketDigestPriceTownCount[]
  /** Featured deal for this tab (DOTW for ALL; DOTD-aligned for other types). */
  deal: MarketDigestDealOfTheWeek | null
}

/** Precomputed 24-month Closed axis cache (bar max). Page-load default is 12 mo. */
export const MARKET_DIGEST_CLOSED_TRAILING_MONTHS = 24

export type MarketDigestSnapshot = {
  generatedAt: string
  /** ALL sales — used by Monday email and default Market Pulse tab. */
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  /** ALL-sales closed totals per town over the trailing window. */
  closedTrailing: MarketDigestClosedTownCount[]
  /** ALL-sales avg DOM per town (default Market Pulse tab). */
  avgDomByTown: MarketDigestDomTownCount[]
  /** ALL-sales median / average price per town (default Market Pulse tab). */
  priceByTown: MarketDigestPriceTownCount[]
  /** Market Pulse tabs (ALL / SFR / Condo / Rentals / Commercial). */
  categories: MarketDigestCategorySlice[]
  dealOfTheWeek: MarketDigestDealOfTheWeek | null
  socialProfiles: { label: string; handleOrUrl: string }[]
}
