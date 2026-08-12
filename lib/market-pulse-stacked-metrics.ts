import { fmtMoney } from '@/lib/listing-history'
import type { MarketPulseCombinedTownRow } from '@/lib/market-pulse-combined-rows'
import { formatPriceDeltaLabel } from '@/lib/market-pulse-price-delta'

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
      label: `Closed (${closedLookbackLabel})`,
      barValueOf: (r) => r.closedCount,
      format: (r) => fmtActive(r.closedCount),
    },
    {
      id: 'medianPrice',
      label: 'Median price',
      barValueOf: (r) => r.medianPrice,
      format: (r) => fmtMoney(r.medianPrice),
    },
    {
      id: 'averagePrice',
      label: 'Average price',
      barValueOf: (r) => r.averagePrice,
      format: (r) => fmtMoney(r.averagePrice),
    },
    {
      id: 'priceDelta',
      label: 'Avg − median',
      barValueOf: (r) => absOrNull(r.priceDelta),
      format: (r) => formatPriceDeltaLabel(r.priceDelta, r.priceDeltaPct),
    },
  ]
}
