import type { ListingKind } from '@/lib/listing-kind'
import {
  isAllTownsCity,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import { marketPulseHeatByCity } from '@/lib/market-pulse-favorability'
import {
  marketPulsePriceBarMax,
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from '@/lib/market-pulse-stacked-metrics'

/**
 * Everything a single town's bars need that comes from the towns around it.
 *
 * A town pulse means nothing on its own — every bar is a share of a ceiling set
 * across the whole set, and the heat reading is a rank against peers. Holding
 * that in one value lets a host outside Market Pulse (a listing page showing
 * one town) compute it once and hand it to the same component, instead of
 * re-deriving axes that would then disagree with the brief.
 */
export type MarketPulseTownScale = {
  /** Bar ceiling per metric, keyed by id so callers never depend on list order. */
  maxByMetric: Record<MarketPulseStackedMetricId, number>
  /** Shared dollar axis for Median, Delta and Average. */
  priceMax: number
  /** Closed axis, when the caller holds a wider ceiling than these rows show. */
  closedBarMax: number
  /** Seller (0) ↔ buyer (1) position per city. */
  heatByCity: Map<string, number>
  /** Towns the heat was ranked against. */
  peerCount: number
}

export function marketPulseTownScale(
  rows: readonly MarketPulseCombinedTownRow[],
  options: {
    closedLookbackLabel: string
    kind?: ListingKind
    /** 24-month Closed ceiling, so a 7d window stays a slice of it. */
    closedBarMax?: number
  },
): MarketPulseTownScale {
  const metrics = marketPulseStackedMetrics(
    options.closedLookbackLabel,
    options.kind ?? 'sale',
  )

  const maxByMetric = {} as Record<MarketPulseStackedMetricId, number>
  for (const metric of metrics) {
    let max = 0
    for (const row of rows) {
      const v = metric.barValueOf(row)
      if (v != null && Number.isFinite(v) && v > max) max = v
    }
    maxByMetric[metric.id] = max
  }

  return {
    maxByMetric,
    priceMax: marketPulsePriceBarMax(rows),
    closedBarMax: options.closedBarMax ?? 0,
    heatByCity: marketPulseHeatByCity(
      rows,
      (r) => ({
        monthsSupply: r.monthsSupply,
        avgDaysOnMarket: r.avgDaysOnMarket,
        closedCount: r.closedCount,
        medianPrice: r.medianPrice,
        priceDelta: r.priceDelta,
        averagePrice: r.averagePrice,
        saleToAskPct: r.saleToAskPct,
      }),
      (r) => isAllTownsCity(r.city),
    ),
    peerCount: rows.filter((r) => !isAllTownsCity(r.city)).length,
  }
}

/** Ceiling a metric's bar is drawn against, honouring the Closed override. */
export function marketPulseMetricMax(
  scale: MarketPulseTownScale,
  id: MarketPulseStackedMetricId,
): number {
  if (id === 'closed' && scale.closedBarMax > 0) return scale.closedBarMax
  if (id === 'medianPrice' || id === 'averagePrice' || id === 'priceDelta') {
    return scale.priceMax
  }
  return scale.maxByMetric[id] ?? 0
}
