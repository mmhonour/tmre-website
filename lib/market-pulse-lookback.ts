/**
 * Market Pulse closed-sales lookback windows.
 * Closed counts (and MOS derived from those closings) use this window.
 * Inventory / avg DOM / prices stay point-in-time.
 */
export const MARKET_PULSE_LOOKBACK_OPTIONS = [
  { id: '7d', label: '7d', days: 7 },
  { id: '14d', label: '14d', days: 14 },
  { id: '1mo', label: '1 mo', days: 30 },
  { id: '2mo', label: '2 mos', days: 60 },
  { id: '4mo', label: '4 mos', days: 120 },
  { id: '6mo', label: '6 mos', days: 180 },
  { id: '12mo', label: '12 mos', days: 365 },
  { id: '24mo', label: '24 mos', days: 730 },
] as const

export type MarketPulseLookbackId =
  (typeof MARKET_PULSE_LOOKBACK_OPTIONS)[number]['id']

export type MarketPulseLookbackOption =
  (typeof MARKET_PULSE_LOOKBACK_OPTIONS)[number]

/** Page-load + Monday email Closed window. */
export const DEFAULT_MARKET_PULSE_LOOKBACK_ID: MarketPulseLookbackId = '12mo'

/**
 * Precomputed stats-cache Closed aggregate and Closed-bar axis ceiling.
 * Shorter slider windows stay a slice of this max. Not the page-load default.
 */
export const MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID: MarketPulseLookbackId =
  '24mo'

export function parseMarketPulseLookbackId(
  raw: string | null | undefined,
): MarketPulseLookbackId {
  const id = (raw ?? '').trim().toLowerCase()
  const match = MARKET_PULSE_LOOKBACK_OPTIONS.find((o) => o.id === id)
  return match?.id ?? DEFAULT_MARKET_PULSE_LOOKBACK_ID
}

export function marketPulseLookbackById(
  id: MarketPulseLookbackId,
): MarketPulseLookbackOption {
  return (
    MARKET_PULSE_LOOKBACK_OPTIONS.find((o) => o.id === id) ??
    MARKET_PULSE_LOOKBACK_OPTIONS.find(
      (o) => o.id === DEFAULT_MARKET_PULSE_LOOKBACK_ID,
    )!
  )
}

/** Short chart title fragment, e.g. "12 mos" or "7d". */
export function marketPulseLookbackChartLabel(
  id: MarketPulseLookbackId,
): string {
  return marketPulseLookbackById(id).label
}

export function marketPulseLookbackIndex(
  id: MarketPulseLookbackId,
): number {
  const i = MARKET_PULSE_LOOKBACK_OPTIONS.findIndex((o) => o.id === id)
  return i >= 0
    ? i
    : MARKET_PULSE_LOOKBACK_OPTIONS.findIndex(
        (o) => o.id === DEFAULT_MARKET_PULSE_LOOKBACK_ID,
      )
}

export function marketPulseLookbackIdAt(
  index: number,
): MarketPulseLookbackId {
  const opt = MARKET_PULSE_LOOKBACK_OPTIONS[index]
  return opt?.id ?? DEFAULT_MARKET_PULSE_LOOKBACK_ID
}

/** Read lookback stamped on a Closed-cache calc payload, if present. */
export function lookbackIdFromClosedCalc(
  rows: Array<{ calc?: { inputs?: unknown } }>,
): MarketPulseLookbackId | null {
  const raw = rows[0]?.calc?.inputs
  if (!raw || typeof raw !== 'object' || !('lookbackId' in raw)) return null
  const id = (raw as { lookbackId?: unknown }).lookbackId
  if (typeof id !== 'string') return null
  return MARKET_PULSE_LOOKBACK_OPTIONS.find((o) => o.id === id)?.id ?? null
}

/** Closed value prefix: `24 mos` → `24 Mos`. */
export function marketPulseLookbackClosedPrefix(label: string): string {
  return label.replace(/\bmos\b/gi, 'Mos').replace(/\bmo\b/gi, 'Mo')
}

/** Right-of-bar Closed text, e.g. `24 Mos - 4653`. */
export function formatClosedCountWithLookback(
  lookbackLabel: string,
  countText: string,
): string {
  return `${marketPulseLookbackClosedPrefix(lookbackLabel)} - ${countText}`
}

/** Closed-bar axis from the 24-month window — shorter lookbacks stay a slice. */
export function closedCountBarMax(
  rows: Array<{ count: number | null | undefined }>,
): number {
  let max = 0
  for (const r of rows) {
    if (r.count != null && Number.isFinite(r.count) && r.count > max) {
      max = r.count
    }
  }
  return max
}

/**
 * Current actives ÷ (closings in this window, expressed as a monthly rate).
 * Used when the visitor picks a non-default Closed lookback.
 */
export function monthsSupplyFromLookbackWindow(
  activeCount: number | null | undefined,
  closedCount: number | null | undefined,
  days: number,
): number | null {
  if (activeCount == null || !Number.isFinite(activeCount) || activeCount < 0) {
    return null
  }
  if (closedCount == null || !Number.isFinite(closedCount) || closedCount <= 0) {
    return null
  }
  if (!Number.isFinite(days) || days <= 0) return null
  const avgMonthly = closedCount / (days / 30)
  if (avgMonthly <= 0) return null
  return activeCount / avgMonthly
}
