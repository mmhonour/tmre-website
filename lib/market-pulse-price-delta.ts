/** Average minus median — positive means a high-end tail (mean above typical sale). */
export function meanMinusMedian(
  averagePrice: number | null | undefined,
  medianPrice: number | null | undefined,
): { dollars: number | null; pct: number | null } {
  const avg =
    averagePrice != null && Number.isFinite(averagePrice) ? averagePrice : null
  const med =
    medianPrice != null && Number.isFinite(medianPrice) ? medianPrice : null
  if (avg == null || med == null) return { dollars: null, pct: null }
  const dollars = avg - med
  const pct = med === 0 ? null : (dollars / med) * 100
  return { dollars, pct }
}

/** Shown in the Delta label popup on Market Pulse. */
export const PRICE_DELTA_EXPLAIN =
  'Delta is average minus median. Average is pulled up by a few high-end sales, so it usually sits above the typical (median) sale. The percent is that dollar gap as a share of the median — not a month-over-month change.'

function signedAbs(n: number, digits: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(digits)}`
}

/**
 * Market Pulse money: under $1M as `$850K` / `$850.5K` (one decimal only
 * when needed). $1M+ stays `$1.25M`.
 */
export function formatMarketPulseMoney(
  dollars: number | null | undefined,
): string {
  if (dollars == null || !Number.isFinite(dollars)) return '—'
  const sign = dollars < 0 ? '−' : ''
  const abs = Math.abs(dollars)
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  }
  const k = abs / 1000
  const tenths = Math.round(k * 10) / 10
  const body = Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)
  return `${sign}$${body}K`
}

/** Compact dollars, e.g. `+$85K` / `−$12.5K`. */
export function formatPriceDeltaK(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return '—'
  const body = formatMarketPulseMoney(Math.abs(dollars))
  const sign = dollars > 0 ? '+' : dollars < 0 ? '−' : ''
  return `${sign}${body}`
}

/** e.g. `+4.2%` / `−1.1%`. */
export function formatPriceDeltaPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  return `${signedAbs(pct, 1)}%`
}

/** Bar-chart / stacked label: `+$85K · +4.2%`. */
export function formatPriceDeltaLabel(
  dollars: number | null | undefined,
  pct: number | null | undefined,
): string {
  return `${formatPriceDeltaK(dollars)} · ${formatPriceDeltaPct(pct)}`
}
