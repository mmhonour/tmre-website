/**
 * The summary statistics a MarketStatsPayload is built from.
 *
 * Every pool is reduced to a count plus its median/mean, so the payload can be
 * produced either from listings already in memory (per-town rebuild) or from a
 * single Postgres aggregate (all-towns), with one formatter for both. Lives in
 * its own module so the pure compute layer and the server-only repo can share
 * the type without importing each other.
 *
 * See marketStatsFromPools() in lib/stats-compute.ts and
 * readMarketStatsPools() in lib/db/stats-aggregates-repo.ts.
 */
export type MarketStatsPools = {
  /** Active listings of this kind — the payload's activeCount / sampleSize. */
  activeCount: number
  /** Closed amounts > 0 inside the stats closed period. */
  closedPriceCount: number
  closedPriceMedian: number | null
  closedPriceMean: number | null
  /** Active list prices > 0 — the median/mean fallback when nothing closed. */
  activePriceCount: number
  activePriceMedian: number | null
  activePriceMean: number | null
  /** Active listings with a non-negative DOM. */
  domCount: number
  domMean: number | null
  /** Active sales with price and sqft > 0; mean of per-listing ratios. */
  ppsfCount: number
  ppsfMean: number | null
  bedsMean: number | null
  /**
   * Closed sales in the stats closed period carrying both a close price and an
   * original list price > 0 — what sellers actually got against what they first
   * asked.
   *
   * Sums rather than a ready-made percentage, because a ratio cannot be summed:
   * All towns is Σclose ÷ Σoriginal over the bigger pool, so a $6M sale weighs
   * what it should and averaging seven town percentages never happens.
   */
  saleToAskCount: number
  saleToAskClosedSum: number
  saleToAskOriginalSum: number
}

export const EMPTY_MARKET_STATS_POOLS: MarketStatsPools = {
  activeCount: 0,
  closedPriceCount: 0,
  closedPriceMedian: null,
  closedPriceMean: null,
  activePriceCount: 0,
  activePriceMedian: null,
  activePriceMean: null,
  domCount: 0,
  domMean: null,
  ppsfCount: 0,
  ppsfMean: null,
  bedsMean: null,
  saleToAskCount: 0,
  saleToAskClosedSum: 0,
  saleToAskOriginalSum: 0,
}
