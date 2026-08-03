import 'server-only'

import { readClosedCountsByTown } from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import {
  MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
  type MarketDigestClosedTownCount,
} from '@/lib/market-digest-types'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/**
 * Closed-sales-by-town totals are a two-year aggregate over every Closed row,
 * which measures 2–6s per property class. Market Pulse has 500'd on Netlify
 * before by doing Closed work inline, so these are cached here and fetched by
 * the client per tab instead of running five of them during SSR.
 */
const TTL_MS = 6 * 60 * 60 * 1000

export type MarketPulseClosedScope = {
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}

export type MarketPulseClosedPayload = {
  months: number
  rows: MarketDigestClosedTownCount[]
  generatedAt: string
}

function cacheKey(scope: MarketPulseClosedScope): string {
  const slice = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  // v2 — rows include cached calc explainers for Market Pulse bar hover.
  return `market-pulse-closed:${scope.kind}:${slice}:${MARKET_DIGEST_CLOSED_TRAILING_MONTHS}m:v2`
}

async function compute(
  scope: MarketPulseClosedScope,
): Promise<MarketPulseClosedPayload> {
  const months = MARKET_DIGEST_CLOSED_TRAILING_MONTHS
  const rows = await readClosedCountsByTown({
    towns: TMRE_TOWNS,
    months,
    kind: scope.kind,
    propertyClass: scope.propertyClass,
    commercialOnly: scope.commercialOnly,
  })
  const noun = scope.commercialOnly
    ? 'commercial closed sales'
    : scope.kind === 'rental'
      ? 'closed leases'
      : 'closed sales'
  const classLabel = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  return {
    months,
    rows: rows.map((row) => ({
      city: row.town,
      count: row.count,
      calc: {
        summary: `${row.count.toLocaleString()} ${noun} in ${row.town} over the trailing ${months} months.`,
        detail: [
          `Postgres count of Closed listings with close date in the trailing ${months}-month window (${classLabel}).`,
          'All towns roll-up is the sum of town counts when shown as “All towns”.',
        ],
        inputs: {
          city: row.town,
          count: row.count,
          months,
          kind: scope.kind,
          propertyClass: scope.propertyClass ?? null,
          commercialOnly: scope.commercialOnly ?? false,
        },
      },
    })),
    generatedAt: new Date().toISOString(),
  }
}

/** Cached totals; recomputes past the TTL. Stale cache beats a failed query. */
export async function readMarketPulseClosedCounts(
  scope: MarketPulseClosedScope,
): Promise<{ payload: MarketPulseClosedPayload; cached: boolean }> {
  const key = cacheKey(scope)
  let stale: MarketPulseClosedPayload | null = null

  try {
    const row = await readStatsCacheRow(key)
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as MarketPulseClosedPayload
      const age = Date.now() - Date.parse(parsed.generatedAt ?? row.computedAt)
      if (Number.isFinite(age) && age < TTL_MS) {
        return { payload: parsed, cached: true }
      }
      stale = parsed
    }
  } catch (err) {
    console.warn(
      '[market-pulse-closed] cache read failed',
      err instanceof Error ? err.message : err,
    )
  }

  try {
    const payload = await compute(scope)
    try {
      await writeStatsCacheRow(key, payload)
    } catch (err) {
      console.warn(
        '[market-pulse-closed] cache write failed',
        err instanceof Error ? err.message : err,
      )
    }
    return { payload, cached: false }
  } catch (err) {
    console.warn(
      '[market-pulse-closed] compute failed',
      err instanceof Error ? err.message : err,
    )
    if (stale) return { payload: stale, cached: true }
    return {
      payload: {
        months: MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
        rows: [],
        generatedAt: new Date().toISOString(),
      },
      cached: false,
    }
  }
}
