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

/** `2026-09-07` → `7 Sep`. Pass `withYear` for YoY. */
export function formatMarketPulseWowSlotLabel(
  slotDate: string,
  withYear = false,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slotDate.trim())
  if (!m) return slotDate
  const month = SLOT_MONTHS[Number(m[2]) - 1]
  const day = String(Number(m[3]))
  if (!month) return slotDate
  return withYear ? `${day} ${month} ${m[1]}` : `${day} ${month}`
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

export type MarketPulseComparePeriod = 'wow' | 'mom' | 'yoy'

export type MarketPulseCompareSet = {
  wow: MarketPulseWowCompare | null
  mom: MarketPulseWowCompare | null
  yoy: MarketPulseWowCompare | null
}

export const EMPTY_MARKET_PULSE_COMPARES: MarketPulseCompareSet = {
  wow: null,
  mom: null,
  yoy: null,
}

export function availableComparePeriods(
  set: MarketPulseCompareSet,
): MarketPulseComparePeriod[] {
  // Month / year slots may exist on disk; the switch is WoW-only until they
  // are a product surface.
  return set.wow ? ['wow'] : []
}

/** Monday email always includes WoW. No month fallback — this is a weekly send. */
export function pickEmailMarketPulseCompare(
  set: MarketPulseCompareSet,
): { period: MarketPulseComparePeriod; compare: MarketPulseWowCompare } | null {
  if (set.wow) return { period: 'wow', compare: set.wow }
  return null
}

export function addIsoDays(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return isoDate
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const next = new Date(utc + days * 86_400_000)
  const y = next.getUTCFullYear()
  const mo = String(next.getUTCMonth() + 1).padStart(2, '0')
  const d = String(next.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * Latest stored slot strictly before `currentSlot` and on/before
 * `currentSlot − minDaysAgo`. WoW uses 1 day (any prior Monday).
 */
export function pickPriorSlotDate(
  slotDates: readonly string[],
  currentSlot: string,
  minDaysAgo: number,
): string | null {
  const cutoff = addIsoDays(currentSlot, -Math.max(1, minDaysAgo))
  const prior = slotDates
    .filter((s) => s < currentSlot && s <= cutoff)
    .sort()
    .at(-1)
  return prior ?? null
}

export const MARKET_PULSE_COMPARE_SWITCH_LABEL: Record<
  'off' | MarketPulseComparePeriod,
  string
> = {
  off: 'Off',
  wow: 'Week Over Week',
  mom: 'Month',
  yoy: 'Year',
}

export function marketPulseWowCaption(wow: MarketPulseWowCompare): string {
  return `Week over week vs ${wow.priorSlotLabel}`
}

export function marketPulseCompareCaption(
  compare: MarketPulseWowCompare,
  period: MarketPulseComparePeriod,
): string {
  const prefix =
    period === 'wow'
      ? 'Week over week'
      : period === 'mom'
        ? 'Month'
        : 'Year'
  const label =
    period === 'yoy'
      ? formatMarketPulseWowSlotLabel(compare.priorSlotDate, true)
      : compare.priorSlotLabel
  return `${prefix} vs ${label}`
}

const BLURB_LABELS: Record<MarketPulseStackedMetricId, string> = {
  inventory: 'Inventory',
  monthsSupply: 'MOS',
  avgDom: 'DOM',
  closed: 'Closed',
  medianPrice: 'Median',
  priceDelta: 'Delta',
  averagePrice: 'Average',
  saleToAsk: 'TRAN$ACT',
  medianTax: 'Median tax',
  taxDelta: 'Tax delta',
  averageTax: 'Average tax',
}

function isQuietDelta(text: string, delta: number): boolean {
  if (delta === 0) return true
  return text === '0' || text === '0.0 mo' || text === '0d' || text === '$0K'
}

/** Town blurb helper for plaintext email. */
export function marketPulseCompareBlurbLines(
  compare: MarketPulseWowCompare | null | undefined,
  city: string,
): { id: MarketPulseStackedMetricId; label: string; text: string }[] {
  if (!compare) return []
  const deltas = compare.byCity[marketPulseWowCityKey(city)]
  if (!deltas) return []
  const lines: { id: MarketPulseStackedMetricId; label: string; text: string }[] =
    []
  for (const id of MARKET_PULSE_STACKED_METRIC_IDS) {
    const d = deltas[id]
    if (!d || isQuietDelta(d.text, d.delta)) continue
    lines.push({ id, label: BLURB_LABELS[id], text: d.text })
  }
  return lines
}

export function marketPulseWowTextFor(
  wow: MarketPulseWowCompare | null | undefined,
  city: string,
  metricId: MarketPulseStackedMetricId,
): string | null {
  if (!wow) return null
  return wow.byCity[marketPulseWowCityKey(city)]?.[metricId]?.text ?? null
}

/** Change figure for the middle of a shaded bar. Quiet zeros stay off the fill. */
export function marketPulseFillDeltaText(
  compare: MarketPulseWowCompare | null | undefined,
  city: string,
  metricId: MarketPulseStackedMetricId,
): string | null {
  if (!compare) return null
  const d = compare.byCity[marketPulseWowCityKey(city)]?.[metricId]
  if (!d || isQuietDelta(d.text, d.delta)) return null
  return d.text
}

/** One-line town summary for plaintext email. */
export function marketPulseCompareBlurbPlain(
  compare: MarketPulseWowCompare | null | undefined,
  city: string,
  period: MarketPulseComparePeriod,
): string | null {
  const lines = marketPulseCompareBlurbLines(compare, city)
  if (!compare || lines.length === 0) return null
  return `${marketPulseCompareCaption(compare, period)}: ${lines
    .map((l) => `${l.label} ${l.text}`)
    .join('; ')}`
}
