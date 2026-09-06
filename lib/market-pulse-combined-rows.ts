import type {
  MarketDigestClosedTownCount,
  MarketDigestDomTownCount,
  MarketDigestPriceTownCount,
  MarketDigestSnapshot,
  MarketDigestTaxTownCount,
} from '@/lib/market-digest-types'
import {
  DEFAULT_MARKET_PULSE_FAVOR_SORT,
} from '@/lib/market-pulse-defaults'
import { sortRowsByBuyerFriendlyScore } from '@/lib/market-pulse-favorability'
import { meanMinusMedian } from '@/lib/market-pulse-price-delta'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'
import type { StatsValueCalc } from '@/lib/stats-compute'

export type MarketPulseCombinedTownRow = {
  city: string
  activeCount: number | null
  monthsSupply: number | null
  avgDaysOnMarket: number | null
  closedCount: number | null
  medianPrice: number | null
  averagePrice: number | null
  /** Average − median (dollars). */
  priceDelta: number | null
  /** (Average − median) / median × 100. */
  priceDeltaPct: number | null
  /** Close ÷ original ask, as a percent (97.4 = closed 2.6% under first ask). */
  saleToAskPct: number | null
  /** Average dollar gap against the first ask (negative = under ask). */
  saleToAskDollars: number | null
  activeCountCalc?: StatsValueCalc
  monthsSupplyCalc?: StatsValueCalc
  avgDaysOnMarketCalc?: StatsValueCalc
  closedCalc?: StatsValueCalc
  medianPriceCalc?: StatsValueCalc
  averagePriceCalc?: StatsValueCalc
  saleToAskCalc?: StatsValueCalc
  priceDeltaCalc?: StatsValueCalc
  medianTax: number | null
  averageTax: number | null
  /** Average − median tax (dollars). */
  taxDelta: number | null
  taxDeltaPct: number | null
  taxYearLabel?: string | null
  taxSampleSize?: number | null
  medianTaxCalc?: StatsValueCalc
  averageTaxCalc?: StatsValueCalc
  taxDeltaCalc?: StatsValueCalc
}

function cityKey(city: string): string {
  return city.trim().toLowerCase()
}

/** The market aggregate row, however the cache spelled it. */
export function isAllTownsCity(city: string): boolean {
  const t = cityKey(city)
  return t === 'all' || t === 'all towns'
}

function chartInventoryRows(snapshot: MarketDigestSnapshot): MonthsSupplyPayload[] {
  const rows: MonthsSupplyPayload[] = []
  if (snapshot.market) rows.push(snapshot.market)
  for (const town of snapshot.towns) {
    if (
      snapshot.market &&
      town.city.trim().toLowerCase() === snapshot.market.city.trim().toLowerCase()
    ) {
      continue
    }
    rows.push(town)
  }
  return rows
}

export function buildMarketPulseCombinedTownRows(
  inventory: MonthsSupplyPayload[],
  domRows: MarketDigestDomTownCount[],
  closedRows: MarketDigestClosedTownCount[],
  priceRows: MarketDigestPriceTownCount[],
  taxRows: MarketDigestTaxTownCount[] = [],
): MarketPulseCombinedTownRow[] {
  const domBy = new Map(domRows.map((r) => [cityKey(r.city), r] as const))
  const closedBy = new Map(closedRows.map((r) => [cityKey(r.city), r] as const))
  const priceBy = new Map(priceRows.map((r) => [cityKey(r.city), r] as const))
  const taxBy = new Map(taxRows.map((r) => [cityKey(r.city), r] as const))
  return inventory.map((row) => {
    const key = cityKey(row.city)
    const dom = domBy.get(key)
    const closed = closedBy.get(key)
    const price = priceBy.get(key)
    const tax = taxBy.get(key)
    // Cached at rebuild. The subtraction stays only as a fallback for a row
    // written before the cache carried it, so a stale entry still shows a delta
    // rather than a blank.
    const delta =
      price?.priceDelta != null || price?.priceDeltaPct != null
        ? { dollars: price.priceDelta ?? null, pct: price.priceDeltaPct ?? null }
        : meanMinusMedian(price?.averagePrice, price?.medianPrice)
    const taxDelta =
      tax?.taxDelta != null || tax?.taxDeltaPct != null
        ? { dollars: tax.taxDelta ?? null, pct: tax.taxDeltaPct ?? null }
        : meanMinusMedian(tax?.averageTax, tax?.medianTax)
    return {
      city: row.city,
      activeCount: row.activeCount ?? null,
      monthsSupply: row.monthsSupply ?? null,
      avgDaysOnMarket: dom?.avgDaysOnMarket ?? null,
      closedCount: closed?.count ?? null,
      medianPrice: price?.medianPrice ?? null,
      averagePrice: price?.averagePrice ?? null,
      priceDelta: delta.dollars,
      priceDeltaPct: delta.pct,
      saleToAskPct: price?.saleToAskPct ?? null,
      saleToAskDollars: price?.saleToAskDollars ?? null,
      activeCountCalc: row.activeCountCalc,
      monthsSupplyCalc: row.monthsSupplyCalc,
      avgDaysOnMarketCalc: dom?.avgDaysOnMarketCalc,
      closedCalc: closed?.calc,
      medianPriceCalc: price?.medianPriceCalc,
      averagePriceCalc: price?.averagePriceCalc,
      saleToAskCalc: price?.saleToAskCalc,
      priceDeltaCalc: price?.priceDeltaCalc,
      medianTax: tax?.medianTax ?? null,
      averageTax: tax?.averageTax ?? null,
      taxDelta: taxDelta.dollars,
      taxDeltaPct: taxDelta.pct,
      taxYearLabel: tax?.taxYearLabel ?? null,
      taxSampleSize: tax?.sampleSize ?? null,
      medianTaxCalc: tax?.medianTaxCalc,
      averageTaxCalc: tax?.averageTaxCalc,
      taxDeltaCalc: tax?.taxDeltaCalc,
    }
  })
}

/** Default Market Pulse / email ordering: stacked Seller Friendly. */
export function defaultMarketPulseCombinedRows(
  snapshot: MarketDigestSnapshot,
): MarketPulseCombinedTownRow[] {
  const built = buildMarketPulseCombinedTownRows(
    chartInventoryRows(snapshot),
    snapshot.avgDomByTown ?? [],
    snapshot.closedTrailing ?? [],
    snapshot.priceByTown ?? [],
    snapshot.taxByTown ?? [],
  )
  return sortRowsByBuyerFriendlyScore(
    built,
    (r) => ({
      monthsSupply: r.monthsSupply,
      avgDaysOnMarket: r.avgDaysOnMarket,
      closedCount: r.closedCount,
      medianPrice: r.medianPrice,
      priceDelta: r.priceDelta,
      averagePrice: r.averagePrice,
      saleToAskPct: r.saleToAskPct,
    }),
    DEFAULT_MARKET_PULSE_FAVOR_SORT,
    (r) => isAllTownsCity(r.city),
  )
}

export function marketPulseAllTownsAvgDom(
  snapshot: MarketDigestSnapshot,
): number | null {
  const allRow = (snapshot.avgDomByTown ?? []).find((r) =>
    isAllTownsCity(r.city),
  )
  const v = allRow?.avgDaysOnMarket
  return v != null && Number.isFinite(v) ? v : null
}
