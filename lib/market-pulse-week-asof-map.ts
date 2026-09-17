import { computeMonthsSupplyRatio } from '@/lib/months-supply-cache'
import { meanMinusMedian } from '@/lib/market-pulse-price-delta'
import type { MarketPulseWeekTownPoint } from '@/lib/market-pulse-week-cache'

export type MarketPulseWeekAsofSqlRow = {
  city: string
  active_count: string | number | null
  closed_12mo: string | number | null
  avg_dom: string | number | null
  med_price: string | number | null
  avg_price: string | number | null
  sta_n: string | number | null
  sta_closed: string | number | null
  sta_orig: string | number | null
  avg_monthly_closings: string | number | null
}

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function int(value: string | number | null | undefined): number | null {
  const n = num(value)
  return n == null ? null : Math.round(n)
}

export function weekPointFromAsofRow(
  row: MarketPulseWeekAsofSqlRow,
): MarketPulseWeekTownPoint {
  const activeCount = int(row.active_count)
  const avgMonthly = num(row.avg_monthly_closings)
  const medianPrice = num(row.med_price)
  const averagePrice = num(row.avg_price)
  const delta = meanMinusMedian(averagePrice, medianPrice)
  const staN = int(row.sta_n) ?? 0
  const staClosed = num(row.sta_closed)
  const staOrig = num(row.sta_orig)
  const saleToAskDollars =
    staN > 0 && staClosed != null && staOrig != null
      ? (staClosed - staOrig) / staN
      : null
  return {
    city: row.city,
    activeCount,
    monthsSupply: computeMonthsSupplyRatio(activeCount ?? 0, avgMonthly),
    avgDaysOnMarket: num(row.avg_dom),
    closedCount: int(row.closed_12mo),
    medianPrice,
    averagePrice,
    priceDelta: delta.dollars,
    saleToAskDollars,
    medianTax: null,
    averageTax: null,
    taxDelta: null,
  }
}

/** Copy yearly tax onto as-of points so tax WoW is not a hole. */
export function overlayWeekTax(
  points: MarketPulseWeekTownPoint[],
  taxByCity: ReadonlyMap<
    string,
    Pick<MarketPulseWeekTownPoint, 'medianTax' | 'averageTax' | 'taxDelta'>
  >,
): MarketPulseWeekTownPoint[] {
  if (taxByCity.size === 0) return points
  return points.map((p) => {
    const tax = taxByCity.get(p.city.trim().toLowerCase())
    if (!tax) return p
    return {
      ...p,
      medianTax: p.medianTax ?? tax.medianTax,
      averageTax: p.averageTax ?? tax.averageTax,
      taxDelta: p.taxDelta ?? tax.taxDelta,
    }
  })
}

export function taxByCityFromPoints(
  rows: readonly Pick<
    MarketPulseWeekTownPoint,
    'city' | 'medianTax' | 'averageTax' | 'taxDelta'
  >[],
): Map<
  string,
  Pick<MarketPulseWeekTownPoint, 'medianTax' | 'averageTax' | 'taxDelta'>
> {
  const out = new Map<
    string,
    Pick<MarketPulseWeekTownPoint, 'medianTax' | 'averageTax' | 'taxDelta'>
  >()
  for (const row of rows) {
    out.set(row.city.trim().toLowerCase(), {
      medianTax: row.medianTax,
      averageTax: row.averageTax,
      taxDelta: row.taxDelta,
    })
  }
  return out
}

export function overlayClosedCounts(
  rows: Array<{ city: string; closedCount: number | null }>,
  closedByCity: ReadonlyMap<string, number>,
): void {
  if (closedByCity.size === 0) return
  for (const row of rows) {
    if (row.closedCount != null) continue
    const n = closedByCity.get(row.city.trim().toLowerCase())
    if (n != null) row.closedCount = n
  }
}
