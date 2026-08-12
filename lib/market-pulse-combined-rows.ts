import type {
  MarketDigestClosedTownCount,
  MarketDigestDomTownCount,
  MarketDigestPriceTownCount,
  MarketDigestSnapshot,
} from '@/lib/market-digest-types'
import {
  DEFAULT_MARKET_PULSE_FAVOR_SORT,
} from '@/lib/market-pulse-defaults'
import { sortRowsByBuyerFriendlyScore } from '@/lib/market-pulse-favorability'
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
  activeCountCalc?: StatsValueCalc
  monthsSupplyCalc?: StatsValueCalc
  avgDaysOnMarketCalc?: StatsValueCalc
  closedCalc?: StatsValueCalc
  medianPriceCalc?: StatsValueCalc
  averagePriceCalc?: StatsValueCalc
}

function cityKey(city: string): string {
  return city.trim().toLowerCase()
}

function isAllTownsCity(city: string): boolean {
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
): MarketPulseCombinedTownRow[] {
  const domBy = new Map(domRows.map((r) => [cityKey(r.city), r] as const))
  const closedBy = new Map(closedRows.map((r) => [cityKey(r.city), r] as const))
  const priceBy = new Map(priceRows.map((r) => [cityKey(r.city), r] as const))
  return inventory.map((row) => {
    const key = cityKey(row.city)
    const dom = domBy.get(key)
    const closed = closedBy.get(key)
    const price = priceBy.get(key)
    return {
      city: row.city,
      activeCount: row.activeCount ?? null,
      monthsSupply: row.monthsSupply ?? null,
      avgDaysOnMarket: dom?.avgDaysOnMarket ?? null,
      closedCount: closed?.count ?? null,
      medianPrice: price?.medianPrice ?? null,
      averagePrice: price?.averagePrice ?? null,
      activeCountCalc: row.activeCountCalc,
      monthsSupplyCalc: row.monthsSupplyCalc,
      avgDaysOnMarketCalc: dom?.avgDaysOnMarketCalc,
      closedCalc: closed?.calc,
      medianPriceCalc: price?.medianPriceCalc,
      averagePriceCalc: price?.averagePriceCalc,
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
  )
  return sortRowsByBuyerFriendlyScore(
    built,
    (r) => ({
      monthsSupply: r.monthsSupply,
      avgDaysOnMarket: r.avgDaysOnMarket,
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
