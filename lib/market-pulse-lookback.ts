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

/** Matches the precomputed stats-cache Closed aggregate. */
export const DEFAULT_MARKET_PULSE_LOOKBACK_ID: MarketPulseLookbackId = '24mo'

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

/** Short chart title fragment, e.g. "24 mos" or "7d". */
export function marketPulseLookbackChartLabel(
  id: MarketPulseLookbackId,
): string {
  return marketPulseLookbackById(id).label
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
