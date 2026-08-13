import type { MarketPulseFavorSort } from '@/lib/market-pulse-favorability'
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  marketPulseLookbackChartLabel,
  type MarketPulseLookbackId,
} from '@/lib/market-pulse-lookback'

/** Default Market Pulse chart layout (web + email). */
export type MarketPulseChartLayout = 'unstacked' | 'stacked'

export const DEFAULT_MARKET_PULSE_CHART_LAYOUT: MarketPulseChartLayout =
  'stacked'

/** Default town sort — Seller Friendly (matches email). */
export const DEFAULT_MARKET_PULSE_FAVOR_SORT: MarketPulseFavorSort = 'sellers'

/**
 * Page-load defaults. Monday email (HTML + plaintext) must use this same
 * combination — never a visitor’s in-session Filters (unstacked, Buyer, etc.).
 * Source of truth: these constants + `marketPulseStackedMetrics()`.
 */

export function marketPulseFavorSortLabel(
  sort: MarketPulseFavorSort,
): string {
  if (sort === 'sellers') return 'Seller Friendly'
  if (sort === 'buyers') return 'Buyer Friendly'
  return 'town order'
}

/**
 * One-line summary of page-load filters (email + collapsed-row copy).
 * Example: "ALL · stacked · Seller Friendly · closed lookback 24 mos."
 */
export function summarizeMarketPulseFilters(options: {
  selectionLabel: string
  chartLayout: MarketPulseChartLayout
  favorSort: MarketPulseFavorSort
  lookbackId: MarketPulseLookbackId
}): string {
  const type = options.selectionLabel.trim() || 'ALL'
  const layout = options.chartLayout === 'stacked' ? 'stacked' : 'unstacked'
  const favor = marketPulseFavorSortLabel(options.favorSort)
  const lookback = marketPulseLookbackChartLabel(
    options.lookbackId || DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  )
  return `${type} · ${layout} · ${favor} · closed lookback ${lookback}`
}
