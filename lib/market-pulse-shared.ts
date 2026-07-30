import { buildIntelligenceShareHref } from '@/lib/intelligence-search-url'
import { statsMonthsSupplyHref, statsSalesTrendHref } from '@/lib/stats-url'
import { isTmreTown, normalizeTownName } from '@/lib/tmre-towns'

/** Market Pulse category tabs (web). Email stays on ALL sales. */
export const MARKET_PULSE_CATEGORY_IDS = [
  'all',
  'sfr',
  'condo',
  'rentals',
  'commercial',
] as const

export type MarketPulseCategoryId = (typeof MARKET_PULSE_CATEGORY_IDS)[number]

/** Map a Market Pulse tab → Intelligence board filters. */
export function marketPulseCategoryToIntelligenceFilters(
  categoryId: MarketPulseCategoryId,
): {
  tx: 'sale' | 'rental'
  cls: 'residential' | 'commercial'
  property: 'all' | 'homes' | 'condos'
} {
  switch (categoryId) {
    case 'sfr':
      return { tx: 'sale', cls: 'residential', property: 'homes' }
    case 'condo':
      return { tx: 'sale', cls: 'residential', property: 'condos' }
    case 'rentals':
      return { tx: 'rental', cls: 'residential', property: 'all' }
    case 'commercial':
      return { tx: 'sale', cls: 'commercial', property: 'all' }
    case 'all':
    default:
      return { tx: 'sale', cls: 'residential', property: 'all' }
  }
}

function marketPulseTownLabelToStatsCity(cityLabel: string): string {
  const raw = cityLabel.trim()
  const isAll =
    !raw || raw.toLowerCase() === 'all' || raw.toLowerCase() === 'all towns'
  if (isAll) return 'All'
  const town = normalizeTownName(raw)
  return town && isTmreTown(town) ? town : 'All'
}

/**
 * /intelligence deep link for a Market Pulse town row (or All towns).
 * `rst=1` tells Intelligence to clear cookie/memory minor filters not in the URL.
 */
export function marketPulseTownIntelligenceHref(
  cityLabel: string,
  categoryId: MarketPulseCategoryId,
): string {
  const filters = marketPulseCategoryToIntelligenceFilters(categoryId)
  const city = marketPulseTownLabelToStatsCity(cityLabel)

  return buildIntelligenceShareHref({
    city,
    tx: filters.tx,
    cls: filters.cls,
    property: filters.property,
    resetMinor: true,
  })
}

/**
 * /stats deep link to the Months supply chart for a Market Pulse town row.
 * Sale tabs → kind=sale; Rentals tab → kind=rental.
 */
export function marketPulseTownMonthsSupplyStatsHref(
  cityLabel: string,
  categoryId: MarketPulseCategoryId,
): string {
  const filters = marketPulseCategoryToIntelligenceFilters(categoryId)
  return statsMonthsSupplyHref({
    city: marketPulseTownLabelToStatsCity(cityLabel),
    kind: filters.tx === 'rental' ? 'rental' : 'sale',
  })
}

/** /stats deep link to closed sales by month for a Market Pulse town row. */
export function marketPulseTownClosedSalesStatsHref(
  cityLabel: string,
  categoryId: MarketPulseCategoryId,
): string {
  const filters = marketPulseCategoryToIntelligenceFilters(categoryId)
  return statsSalesTrendHref({
    city: marketPulseTownLabelToStatsCity(cityLabel),
    kind: filters.tx === 'rental' ? 'rental' : 'sale',
  })
}
