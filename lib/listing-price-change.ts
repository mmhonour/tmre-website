/**
 * Temporal list-price move for a listing — last change only.
 * A newer price overwrite replaces the prior calc (no cumulative ladder).
 * Client-safe: no DB / server-only imports.
 */

export type ListingPriceChangeDirection = 'reduced' | 'increased'

export type ListingPriceChange = {
  previousPrice: number
  currentPrice: number
  /** Signed dollars: current − previous (negative = reduction). */
  amount: number
  /** Signed percent of previous: ((current − previous) / previous) × 100. */
  percent: number
  direction: ListingPriceChangeDirection
  /** When the move was observed (MLS PriceChangeTimestamp or sync time). */
  changedAt: string | null
}

/** Compute the latest move. Returns null when either side is missing or unchanged. */
export function computeListingPriceChange(
  previousPrice: number | null | undefined,
  currentPrice: number | null | undefined,
  changedAt: string | null = null,
): ListingPriceChange | null {
  if (
    previousPrice == null ||
    currentPrice == null ||
    !Number.isFinite(previousPrice) ||
    !Number.isFinite(currentPrice) ||
    previousPrice <= 0 ||
    currentPrice <= 0 ||
    previousPrice === currentPrice
  ) {
    return null
  }
  const amount = currentPrice - previousPrice
  const percent = (amount / previousPrice) * 100
  return {
    previousPrice,
    currentPrice,
    amount,
    percent,
    direction: amount < 0 ? 'reduced' : 'increased',
    changedAt: changedAt?.trim() || null,
  }
}

/** Compact dollar delta for feed rows, e.g. "−$50k" / "+$12,500". */
export function formatPriceChangeAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '—'
  const sign = amount < 0 ? '−' : '+'
  const abs = Math.abs(amount)
  if (abs >= 10_000) {
    const thousands = abs / 1000
    const label =
      thousands >= 100
        ? Math.round(thousands).toLocaleString('en-US')
        : thousands.toFixed(thousands >= 10 ? 0 : 1).replace(/\.0$/, '')
    return `${sign}$${label}k`
  }
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

/** Compact percent delta, e.g. "−3.8%" / "+1.2%". */
export function formatPriceChangePercent(percent: number): string {
  if (!Number.isFinite(percent) || percent === 0) return '—'
  const sign = percent < 0 ? '−' : '+'
  return `${sign}${Math.abs(percent).toFixed(1)}%`
}

/** One-line label for Latest / cards. */
export function formatPriceChangeLabel(
  change: Pick<ListingPriceChange, 'amount' | 'percent'>,
): string {
  return `${formatPriceChangeAmount(change.amount)} (${formatPriceChangePercent(change.percent)})`
}
