import {
  cityKey,
  isAllTownsCity,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import { formatPriceDeltaK } from '@/lib/market-pulse-price-delta'
import {
  MARKET_PULSE_STACKED_METRIC_IDS,
  type MarketPulseStackedMetricId,
} from '@/lib/market-pulse-stacked-metrics'

export type MarketPulseWowDelta = {
  /** current − prior, after the same rounding the stacked value uses. */
  delta: number
  /** Preformatted for the value column, e.g. `+12` / `−0.4 mo` / `+$85K`. */
  text: string
}

export type MarketPulseWowByCity = Record<
  string,
  Partial<Record<MarketPulseStackedMetricId, MarketPulseWowDelta>>
>

export type MarketPulseWowCompare = {
  priorSlotDate: string
  /** Eastern send-day, e.g. `7 Sep`. */
  priorSlotLabel: string
  byCity: MarketPulseWowByCity
}

const SLOT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** `2026-09-07` → `7 Sep`. */
export function formatMarketPulseWowSlotLabel(slotDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slotDate.trim())
  if (!m) return slotDate
  const month = SLOT_MONTHS[Number(m[2]) - 1]
  const day = String(Number(m[3]))
  return month ? `${day} ${month}` : slotDate
}

function finiteOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null
}

function metricNumber(
  row: MarketPulseCombinedTownRow,
  id: MarketPulseStackedMetricId,
): number | null {
  switch (id) {
    case 'inventory':
      return finiteOrNull(row.activeCount)
    case 'monthsSupply':
      return finiteOrNull(row.monthsSupply)
    case 'avgDom':
      return finiteOrNull(row.avgDaysOnMarket)
    case 'closed':
      return finiteOrNull(row.closedCount)
    case 'medianPrice':
      return finiteOrNull(row.medianPrice)
    case 'priceDelta':
      return finiteOrNull(row.priceDelta)
    case 'averagePrice':
      return finiteOrNull(row.averagePrice)
    case 'saleToAsk':
      return finiteOrNull(row.saleToAskDollars)
    case 'medianTax':
      return finiteOrNull(row.medianTax)
    case 'taxDelta':
      return finiteOrNull(row.taxDelta)
    case 'averageTax':
      return finiteOrNull(row.averageTax)
  }
}

/** Round to the figure the stacked value column shows, then subtract. */
function displayNumber(
  id: MarketPulseStackedMetricId,
  n: number,
): number {
  if (id === 'monthsSupply') return Math.round(n * 10) / 10
  if (
    id === 'inventory' ||
    id === 'closed' ||
    id === 'avgDom'
  ) {
    return Math.round(n)
  }
  return n
}

function signedInt(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

function formatWowText(
  id: MarketPulseStackedMetricId,
  delta: number,
): string {
  if (id === 'monthsSupply') {
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
    return `${sign}${Math.abs(delta).toFixed(1)} mo`
  }
  if (id === 'avgDom') return `${signedInt(delta)}d`
  if (
    id === 'medianPrice' ||
    id === 'averagePrice' ||
    id === 'priceDelta' ||
    id === 'saleToAsk' ||
    id === 'medianTax' ||
    id === 'taxDelta' ||
    id === 'averageTax'
  ) {
    return formatPriceDeltaK(delta)
  }
  return signedInt(delta)
}

/** All / All Towns share one archive key so a spelling change is not a miss. */
export function marketPulseWowCityKey(city: string): string {
  return isAllTownsCity(city) ? 'all' : cityKey(city)
}

function rowsByCity(
  rows: readonly MarketPulseCombinedTownRow[],
): Map<string, MarketPulseCombinedTownRow> {
  const map = new Map<string, MarketPulseCombinedTownRow>()
  for (const row of rows) {
    map.set(marketPulseWowCityKey(row.city), row)
  }
  return map
}

/**
 * Default stacked metrics, this snapshot minus the previous send-day.
 * Returns null when nothing is comparable (no prior towns, or every metric blank).
 */
export function buildMarketPulseWow(
  currentRows: readonly MarketPulseCombinedTownRow[],
  priorRows: readonly MarketPulseCombinedTownRow[],
  priorSlotDate: string,
): MarketPulseWowCompare | null {
  const priorBy = rowsByCity(priorRows)
  const byCity: MarketPulseWowByCity = {}
  let any = false

  for (const row of currentRows) {
    const prior = priorBy.get(marketPulseWowCityKey(row.city))
    if (!prior) continue
    const deltas: Partial<Record<MarketPulseStackedMetricId, MarketPulseWowDelta>> =
      {}
    for (const id of MARKET_PULSE_STACKED_METRIC_IDS) {
      const curRaw = metricNumber(row, id)
      const priorRaw = metricNumber(prior, id)
      if (curRaw == null || priorRaw == null) continue
      const delta = displayNumber(id, curRaw) - displayNumber(id, priorRaw)
      if (!Number.isFinite(delta)) continue
      deltas[id] = { delta, text: formatWowText(id, delta) }
      any = true
    }
    if (Object.keys(deltas).length > 0) {
      byCity[marketPulseWowCityKey(row.city)] = deltas
    }
  }

  if (!any) return null
  return {
    priorSlotDate,
    priorSlotLabel: formatMarketPulseWowSlotLabel(priorSlotDate),
    byCity,
  }
}

export function marketPulseWowCaption(wow: MarketPulseWowCompare): string {
  return `WoW vs ${wow.priorSlotLabel}`
}

export function marketPulseWowTextFor(
  wow: MarketPulseWowCompare | null | undefined,
  city: string,
  metricId: MarketPulseStackedMetricId,
): string | null {
  if (!wow) return null
  return wow.byCity[marketPulseWowCityKey(city)]?.[metricId]?.text ?? null
}
