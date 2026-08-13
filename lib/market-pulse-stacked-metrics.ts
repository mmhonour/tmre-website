import { fmtMoney } from '@/lib/listing-history'
import type { MarketPulseCombinedTownRow } from '@/lib/market-pulse-combined-rows'
import { formatClosedCountWithLookback } from '@/lib/market-pulse-lookback'
import {
  formatPriceDeltaK,
  formatPriceDeltaPct,
} from '@/lib/market-pulse-price-delta'

/**
 * Stacked town-metric order for default /market-pulse AND the Monday email.
 * Add/remove metrics here — do not keep a second list in the email HTML.
 */
export const MARKET_PULSE_STACKED_METRIC_IDS = [
  'inventory',
  'monthsSupply',
  'avgDom',
  'closed',
  'medianPrice',
  'averagePrice',
  'priceDelta',
] as const

export type MarketPulseStackedMetricId =
  (typeof MARKET_PULSE_STACKED_METRIC_IDS)[number]

export type MarketPulseStackedMetricDef = {
  id: MarketPulseStackedMetricId
  label: string
  /** Left-column label when it includes a per-row suffix (Delta + %). */
  labelOf?: (row: MarketPulseCombinedTownRow) => string
  /** Bar width (absolute value for signed deltas). */
  barValueOf: (row: MarketPulseCombinedTownRow) => number | null
  format: (row: MarketPulseCombinedTownRow) => string
}

function fmtActive(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(Math.round(n))
}

function fmtMos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `${n.toFixed(1)} mo`
}

function fmtDom(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n)}d`
}

function absOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? Math.abs(n) : null
}

/** Default stacked metrics (page load + email). `closedLookbackLabel` e.g. `24 mos`. */
export function marketPulseStackedMetrics(
  closedLookbackLabel: string,
): MarketPulseStackedMetricDef[] {
  return [
    {
      id: 'inventory',
      label: 'Inventory',
      barValueOf: (r) => r.activeCount,
      format: (r) => fmtActive(r.activeCount),
    },
    {
      id: 'monthsSupply',
      label: 'Months supply',
      barValueOf: (r) => r.monthsSupply,
      format: (r) => fmtMos(r.monthsSupply),
    },
    {
      id: 'avgDom',
      label: 'Avg DOM',
      barValueOf: (r) => r.avgDaysOnMarket,
      format: (r) => fmtDom(r.avgDaysOnMarket),
    },
    {
      id: 'closed',
      label: 'Closed',
      barValueOf: (r) => r.closedCount,
      format: (r) =>
        formatClosedCountWithLookback(
          closedLookbackLabel,
          fmtActive(r.closedCount),
        ),
    },
    {
      id: 'medianPrice',
      label: 'Median',
      barValueOf: (r) => r.medianPrice,
      format: (r) => fmtMoney(r.medianPrice),
    },
    {
      id: 'averagePrice',
      label: 'Avg',
      barValueOf: (r) => r.averagePrice,
      format: (r) => fmtMoney(r.averagePrice),
    },
    {
      id: 'priceDelta',
      label: 'Delta',
      labelOf: (r) => `Delta ${formatPriceDeltaPct(r.priceDeltaPct)}`,
      barValueOf: (r) => absOrNull(r.priceDelta),
      format: (r) => formatPriceDeltaK(r.priceDelta),
    },
  ]
}

/** Shared dollar axis for Median, Avg, and Delta (do not scale Delta to its own max). */
export function marketPulsePriceBarMax(
  rows: Array<{
    medianPrice: number | null
    averagePrice: number | null
  }>,
): number {
  let max = 0
  for (const r of rows) {
    for (const v of [r.medianPrice, r.averagePrice]) {
      if (v != null && Number.isFinite(v) && v > max) max = v
    }
  }
  return max
}

export function isMarketPulsePriceScaleMetric(
  id: MarketPulseStackedMetricId,
): boolean {
  return id === 'medianPrice' || id === 'averagePrice' || id === 'priceDelta'
}
