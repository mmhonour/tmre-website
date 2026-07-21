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

/** Matches `StatsChartPrintFrame` `chartId` / `#stats-chart-{id}`. */
export type InterestingStatChartId =
  | 'sales-trend'
  | 'active-by-month'
  | 'sales-by-vintage'
  | 'sales-by-price'
  | 'median-by-town'
  | 'avg-dom'
  | 'town-comparison'

const CHART_BY_KIND: Record<InterestingStatKind, InterestingStatChartId> = {
  'closed-this-week': 'sales-trend',
  'closed-zip': 'sales-trend',
  'months-supply': 'sales-trend',
  'tightest-supply': 'sales-trend',
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
  'active-by-month',
  'sales-by-vintage',
  'sales-by-price',
  'median-by-town',
  'avg-dom',
  'town-comparison',
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
  return INTERESTING_STAT_CHART_IDS.includes(value as InterestingStatChartId)
    ? (value as InterestingStatChartId)
    : null
}

/** Stats page deep link for a given insight (city + chart target). */
export function interestingStatHref(
  kind: InterestingStatKind,
  town: string | null,
): string {
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

  switch (chart) {
    case 'sales-trend':
      urls.push(
        `/api/sales-by-month?${cityQs}&kind=sale`,
        `/api/months-supply?${cityQs}&kind=sale&property=homes`,
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
