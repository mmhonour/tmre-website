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

/** Footer form on /market-pulse — web jump + Monday email use this same hash. */
export const MARKET_PULSE_JOIN_BRIEF_ID = 'join-the-brief'

/** Headline inventory KPI on /market-pulse, the floating strip, and the Monday email. */
export const MARKET_PULSE_ACTIVE_KPI_LABEL = 'Active Homes'

/** Visitor-facing name for close ÷ original ask (stacked, unstacked, Stats). */
export const TRANSACT_TO_LIST_LABEL = 'TRAN$ACT to LIST'

/** Row label from the sign of close − original ask. Zero / missing keeps the base. */
export function transactToListLabel(
  dollars: number | null | undefined,
): string {
  if (dollars == null || !Number.isFinite(dollars) || dollars === 0) {
    return TRANSACT_TO_LIST_LABEL
  }
  return dollars > 0 ? 'Tran$act over list' : 'Tran$act under list'
}

/**
 * Page-load defaults. Monday email (HTML + plaintext) must use this same
 * combination for the stacked charts — never a visitor’s in-session Filters
 * (unstacked, Buyer, etc.). Source of truth: these constants +
 * `marketPulseStackedMetrics()`.
 *
 * Compare figures: the Monday email always includes Week Over Week in the gold
 * fill (weekly send). /market-pulse is the only web surface with the switch
 * (stacked and unstacked), and it defaults Off. Listing pulse, home pulse, and
 * any other Market Pulse embedding stay Off — they do not load compares. Month
 * Over Month and Year Over Year join the switch once those week slots exist.
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
 * Example: "ALL · stacked · Seller Friendly · closed lookback 12 mos."
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
