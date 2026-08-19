import type { MarketPulseCombinedTownRow } from '@/lib/market-pulse-combined-rows'
import { formatClosedCountWithLookback } from '@/lib/market-pulse-lookback'
import {
  formatMarketPulseMoney,
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
  'priceDelta',
  'averagePrice',
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

/** Default stacked metrics (page load + email). `closedLookbackLabel` e.g. `12 mos`. */
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
      label: 'AVG DAYS ON MARKET',
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
      format: (r) => formatMarketPulseMoney(r.medianPrice),
    },
    {
      id: 'priceDelta',
      label: 'Delta',
      labelOf: (r) => `Delta ${formatPriceDeltaPct(r.priceDeltaPct)}`,
      barValueOf: (r) => absOrNull(r.priceDelta),
      format: (r) => formatPriceDeltaK(r.priceDelta),
    },
    {
      id: 'averagePrice',
      label: 'Average',
      barValueOf: (r) => r.averagePrice,
      format: (r) => formatMarketPulseMoney(r.averagePrice),
    },
  ]
}

/** Shared dollar axis for Median, Delta, and Average (do not scale Delta to its own max). */
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

function clampBarPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** Dollar value → % of the shared Median / Average axis. */
export function marketPulsePricePct(
  dollars: number | null | undefined,
  priceMax: number,
): number {
  if (priceMax <= 0 || dollars == null || !Number.isFinite(dollars)) return 0
  return clampBarPct((dollars / priceMax) * 100)
}

/**
 * Delta bar spans the gap between the median-bar end and the average-bar end
 * on the shared dollar axis (not a bar that starts at 0).
 */
export function marketPulseDeltaBarSpan(
  medianPct: number,
  averagePct: number,
): { leftPct: number; widthPct: number } {
  const med = clampBarPct(medianPct)
  const avg = clampBarPct(averagePct)
  const leftPct = Math.min(med, avg)
  return { leftPct, widthPct: Math.max(med, avg) - leftPct }
}

export function isMarketPulsePriceScaleMetric(
  id: MarketPulseStackedMetricId,
): boolean {
  return id === 'medianPrice' || id === 'averagePrice' || id === 'priceDelta'
}
