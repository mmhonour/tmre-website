import 'server-only'

import { query } from '@/lib/db/postgres'
import {
  EMPTY_MARKET_STATS_POOLS,
  type MarketStatsPools,
} from '@/lib/stats-market-pools'

// ---------------------------------------------------------------------------
// Postgres-side aggregates for the stats cache.
//
// The all-towns payloads used to be computed by SELECTing every Active and
// every Closed listing in the market and reducing them in Node. That is what
// exhausted V8's heap on Railway: Postgres was fine serving the rows, the
// JavaScript process could not hold them. Counts, sums, means, and medians are
// what a database engine does best — compiled aggregates over stored pages, no
// row set materialized outside the server — so they belong here.
//
// Additive payloads (price/vintage histograms, monthly counts) do not need SQL
// at all: they are summed from the per-town payloads already in stats_cache.
// This module is only for the values that cannot be combined from parts —
// medians and means over the whole market.
//
// The regexes below mirror lib/listing-kind.ts against the same haystack of
// columns that helper reads, following the convention already established by
// readClosedCountsByTown(). Change one, change the other.
// ---------------------------------------------------------------------------

/** Rental hints, same fields (and order) as `isRentalListing`. */
export const LISTING_KIND_HAY_SQL = `concat_ws(' ', property_type,
          raw->>'PropertyType', raw->>'PropertySubType',
          raw->>'TransactionType', raw->>'MRD_TYP',
          raw->>'StandardStatus')`

const RENTAL_REGEX = 'rent|lease'

/** Predicate over a `kind_hay` column produced by {@link LISTING_KIND_HAY_SQL}. */
export function listingKindClauseSql(kind: 'sale' | 'rental'): string {
  return kind === 'rental'
    ? `kind_hay ~* '${RENTAL_REGEX}'`
    : `kind_hay !~* '${RENTAL_REGEX}'`
}

/**
 * When a close happened, mirroring `closedListingTimestamp()`.
 *
 * modification_timestamp is deliberately kept as the last fallback so these
 * aggregates match the Node numbers they replace. Note that the MLS re-stamps
 * it on old Closed rows, which can pull a pre-period sale into the window —
 * that is pre-existing behaviour, not something introduced here. Trailing-window
 * queries (readClosedCountsByTown) intentionally leave it out.
 */
const CLOSED_AT_SQL =
  'COALESCE(close_date, status_change_timestamp, modification_timestamp)'

/** pg returns numeric/avg as string; NULL for an empty pool. */
function num(value: string | number | null): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function int(value: string | number | null): number {
  return Math.round(num(value) ?? 0)
}

/**
 * One round trip for every market-stats pool across `towns`.
 *
 * Pools mirror computeMarketStats() exactly: closed amounts are
 * COALESCE(close_price, price) > 0 inside the closed period, active prices are
 * price > 0, DOM is any non-negative value, $/sqft is the mean of per-listing
 * price ÷ sqft (sale only), beds are > 0. percentile_cont(0.5) is the same
 * mid-point the JS median takes, including the average of the two middle values
 * on an even count.
 *
 * The close-year window uses the Postgres session timezone, as the JS version
 * used the process timezone; both are UTC in production, so the period boundary
 * lands on the same rows.
 */
export async function readMarketStatsPools(args: {
  towns: readonly string[]
  kind: 'sale' | 'rental'
  /** Inclusive close-year window, from STATS_CLOSED_PERIOD_START. */
  periodStartYear: number
  periodEndYear: number
}): Promise<MarketStatsPools> {
  const towns = [...args.towns]
  if (towns.length === 0) return { ...EMPTY_MARKET_STATS_POOLS }

  const rows = await query<{
    active_count: string | number
    closed_price_count: string | number
    closed_price_median: string | null
    closed_price_mean: string | null
    active_price_count: string | number
    active_price_median: string | null
    active_price_mean: string | null
    dom_count: string | number
    dom_mean: string | null
    ppsf_count: string | number
    ppsf_mean: string | null
    beds_mean: string | null
  }>(
    `WITH scoped AS (
       SELECT status_bucket, price, close_price, dom, sqft, beds,
              ${CLOSED_AT_SQL} AS closed_at,
              ${LISTING_KIND_HAY_SQL} AS kind_hay
         FROM listings
        WHERE town = ANY($1::text[])
          AND status_bucket IN ('Active', 'Closed')
     ),
     of_kind AS (
       SELECT * FROM scoped WHERE ${listingKindClauseSql(args.kind)}
     ),
     active AS (
       SELECT price, dom, sqft, beds FROM of_kind WHERE status_bucket = 'Active'
     ),
     closed AS (
       SELECT COALESCE(close_price, price) AS amount
         FROM of_kind
        WHERE status_bucket = 'Closed'
          AND closed_at IS NOT NULL
          AND EXTRACT(YEAR FROM closed_at) BETWEEN $2::int AND $3::int
     ),
     closed_priced AS (
       SELECT amount FROM closed WHERE amount > 0
     ),
     active_priced AS (
       SELECT price FROM active WHERE price > 0
     )
     SELECT
       (SELECT count(*) FROM active) AS active_count,
       (SELECT count(*) FROM closed_priced) AS closed_price_count,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount)
          FROM closed_priced) AS closed_price_median,
       (SELECT avg(amount) FROM closed_priced) AS closed_price_mean,
       (SELECT count(*) FROM active_priced) AS active_price_count,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price)
          FROM active_priced) AS active_price_median,
       (SELECT avg(price) FROM active_priced) AS active_price_mean,
       (SELECT count(*) FROM active WHERE dom >= 0) AS dom_count,
       (SELECT avg(dom) FROM active WHERE dom >= 0) AS dom_mean,
       (SELECT count(*) FROM active WHERE price > 0 AND sqft > 0) AS ppsf_count,
       (SELECT avg(price / sqft) FROM active WHERE price > 0 AND sqft > 0) AS ppsf_mean,
       (SELECT avg(beds) FROM active WHERE beds > 0) AS beds_mean`,
    [towns, args.periodStartYear, args.periodEndYear],
  )

  const row = rows[0]
  if (!row) return { ...EMPTY_MARKET_STATS_POOLS }
  return {
    activeCount: int(row.active_count),
    closedPriceCount: int(row.closed_price_count),
    closedPriceMedian: num(row.closed_price_median),
    closedPriceMean: num(row.closed_price_mean),
    activePriceCount: int(row.active_price_count),
    activePriceMedian: num(row.active_price_median),
    activePriceMean: num(row.active_price_mean),
    domCount: int(row.dom_count),
    domMean: num(row.dom_mean),
    ppsfCount: int(row.ppsf_count),
    ppsfMean: num(row.ppsf_mean),
    bedsMean: num(row.beds_mean),
  }
}
