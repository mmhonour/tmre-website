/**
 * Homepage interesting-stat → Stats deep links + warm URLs.
 * Client-safe (no server-only imports).
 */

export type InterestingStatKind =
  | 'closed-this-week'
  | 'closed-zip'
  | 'months-supply'
  | 'tightest-supply'
  | 'median-price'
  | 'avg-dom'
  | 'fastest-dom'
  | 'best-vintage'
  | 'vintage-gap'
  | 'active-count'
  | 'most-active'
  | 'avg-ppsf'
  | 'avg-beds'
  | 'sales-vintage'
  | 'sales-price-band'
  | 'sales-yoy'
  | 'sales-mom'
  | 'inventory-mom'

/** Canonical Stats chart slug for close ÷ original ask (TRAN$ACT to LIST). */
export const TRANSACT_TO_LIST_CHART_ID = 'transact-to-list'

/** Older `?chart=` / `#stats-chart-` values that still resolve to this chart. */
export const TRANSACT_TO_LIST_CHART_ALIASES = ['list-to-ask'] as const

/** Matches `StatsChartPrintFrame` `chartId` / `#stats-chart-{id}`. */
export type InterestingStatChartId =
  | 'sales-trend'
  | 'months-supply'
  | 'active-by-month'
  | 'sales-by-vintage'
  | 'sales-by-price'
  | 'median-by-town'
  | 'avg-dom'
  | 'town-comparison'
  | typeof TRANSACT_TO_LIST_CHART_ID
  | 'price-spread'

const CHART_BY_KIND: Record<InterestingStatKind, InterestingStatChartId> = {
  'closed-this-week': 'sales-trend',
  'closed-zip': 'sales-trend',
  'months-supply': 'months-supply',
  'tightest-supply': 'months-supply',
  'sales-yoy': 'sales-trend',
  'sales-mom': 'sales-trend',
  'active-count': 'active-by-month',
  'most-active': 'active-by-month',
  'inventory-mom': 'active-by-month',
  'best-vintage': 'sales-by-vintage',
  'vintage-gap': 'sales-by-vintage',
  'sales-vintage': 'sales-by-vintage',
  'sales-price-band': 'sales-by-price',
  'median-price': 'median-by-town',
  'avg-ppsf': 'town-comparison',
  'avg-beds': 'town-comparison',
  'avg-dom': 'avg-dom',
  'fastest-dom': 'avg-dom',
}

export const INTERESTING_STAT_CHART_IDS: readonly InterestingStatChartId[] = [
  'sales-trend',
  'months-supply',
  'active-by-month',
  'sales-by-vintage',
  'sales-by-price',
  'median-by-town',
  'avg-dom',
  'town-comparison',
  TRANSACT_TO_LIST_CHART_ID,
  'price-spread',
]

export function interestingStatChartId(
  kind: InterestingStatKind,
): InterestingStatChartId {
  return CHART_BY_KIND[kind] ?? 'sales-trend'
}

export function parseInterestingStatChartId(
  value: string | null | undefined,
): InterestingStatChartId | null {
  if (!value) return null
  if (INTERESTING_STAT_CHART_IDS.includes(value as InterestingStatChartId)) {
    return value as InterestingStatChartId
  }
  if (
    (TRANSACT_TO_LIST_CHART_ALIASES as readonly string[]).includes(value)
  ) {
    return TRANSACT_TO_LIST_CHART_ID
  }
  return null
}

/**
 * Deep link for a given insight.
 * Score-by-era insights are about active Goldilocks scores — not closed-sales
 * vintage mix — so they go to /score instead of Sales by vintage.
 */
export function interestingStatHref(
  kind: InterestingStatKind,
  town: string | null,
): string {
  if (kind === 'best-vintage' || kind === 'vintage-gap') {
    return '/score'
  }
  const params = new URLSearchParams()
  if (town) params.set('city', town)
  params.set('kind', 'sale')
  params.set('chart', interestingStatChartId(kind))
  return `/stats?${params.toString()}`
}

export function interestingStatChartElementId(chartId: InterestingStatChartId): string {
  return `stats-chart-${chartId}`
}

/** API URLs to warm so the target chart paints from cache on navigation. */
export function interestingStatWarmUrls(
  kind: InterestingStatKind,
  town: string | null,
): string[] {
  const city = town?.trim() || 'All'
  const cityQs =
    city === 'All' ? 'city=All' : `city=${encodeURIComponent(city)}`
  const chart = interestingStatChartId(kind)
  const urls: string[] = [`/api/stats/page?kind=sale`]

  // Score-by-era insights deep-link to /score — no Stats chart warm needed.
  if (kind === 'best-vintage' || kind === 'vintage-gap') {
    return urls
  }

  switch (chart) {
    case 'sales-trend':
      urls.push(
        `/api/sales-by-month?${cityQs}&kind=sale`,
        `/api/months-supply?${cityQs}&kind=sale&property=homes`,
      )
      break
    case 'months-supply':
      urls.push(
        `/api/months-supply-by-month?${cityQs}&kind=sale`,
        `/api/months-supply?${cityQs}&kind=sale&property=all`,
      )
      break
    case 'active-by-month':
      urls.push(`/api/active-by-month?${cityQs}&kind=sale`)
      break
    case 'sales-by-vintage':
      urls.push(`/api/sales-by-vintage?${cityQs}&kind=sale`)
      break
    case 'sales-by-price':
      urls.push(`/api/sales-by-price?${cityQs}&kind=sale`)
      break
    case 'median-by-town':
    case 'avg-dom':
    case 'town-comparison':
      urls.push(`/api/market-stats?${cityQs}&kind=sale`)
      break
  }

  return [...new Set(urls)]
}
