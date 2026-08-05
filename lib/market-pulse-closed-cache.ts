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

/**
 * One scope per Market Pulse tab (mirrors CLOSED_QUERY in MarketPulseContent).
 * The stats-cache rebuild precomputes all of them so the page never computes.
 */
export const MARKET_PULSE_CLOSED_SCOPES: readonly MarketPulseClosedScope[] = [
  { kind: 'sale', propertyClass: 'all' },
  { kind: 'sale', propertyClass: 'homes' },
  { kind: 'sale', propertyClass: 'condos' },
  { kind: 'rental', propertyClass: 'all' },
  { kind: 'sale', commercialOnly: true },
]

function cacheKey(scope: MarketPulseClosedScope): string {
  const slice = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  // v3 — rows now lead with the All towns roll-up bar.
  return `market-pulse-closed:${scope.kind}:${slice}:${MARKET_DIGEST_CLOSED_TRAILING_MONTHS}m:v3`
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
  const townRows: MarketDigestClosedTownCount[] = rows.map((row) => ({
    city: row.town,
    count: row.count,
    calc: {
      summary: `${row.count.toLocaleString()} ${noun} in ${row.town} over the trailing ${months} months.`,
      detail: [
        `Postgres count of Closed listings with close date in the trailing ${months}-month window (${classLabel}).`,
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
  }))

  // All towns bar — summed here so the chart never adds up rows client-side.
  const total = townRows.reduce((sum, row) => sum + row.count, 0)
  const allRow: MarketDigestClosedTownCount = {
    city: 'All',
    count: total,
    calc: {
      summary: `${total.toLocaleString()} ${noun} across all ${townRows.length} TMRE towns over the trailing ${months} months.`,
      detail: [
        `Sum of the per-town Closed counts below (${classLabel}), same trailing ${months}-month window.`,
        'Precomputed by the stats cache rebuild — the page reads it, never recounts it.',
      ],
      inputs: {
        city: 'All',
        count: total,
        towns: townRows.length,
        months,
        kind: scope.kind,
        propertyClass: scope.propertyClass ?? null,
        commercialOnly: scope.commercialOnly ?? false,
      },
    },
  }

  return {
    months,
    rows: townRows.length > 0 ? [allRow, ...townRows] : [],
    generatedAt: new Date().toISOString(),
  }
}

function emptyPayload(): MarketPulseClosedPayload {
  return {
    months: MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
    rows: [],
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Cached totals. Read-only by default: Market Pulse must never run the two-year
 * Closed aggregate during a request. Stale rows still serve — only the stats
 * cache rebuild (and the Monday email, via `allowCompute`) may recount.
 */
export async function readMarketPulseClosedCounts(
  scope: MarketPulseClosedScope,
  options: { allowCompute?: boolean } = {},
): Promise<{
  payload: MarketPulseClosedPayload
  cached: boolean
  /** No cache row at all — needs a stats cache rebuild to populate. */
  needsRebuild?: boolean
}> {
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

  if (!options.allowCompute) {
    // Stale beats empty; empty beats a 26s aggregate on the read path.
    if (stale) return { payload: stale, cached: true }
    return { payload: emptyPayload(), cached: false, needsRebuild: true }
  }

  try {
    return { payload: await computeAndCache(scope), cached: false }
  } catch (err) {
    console.warn(
      '[market-pulse-closed] compute failed',
      err instanceof Error ? err.message : err,
    )
    if (stale) return { payload: stale, cached: true }
    return { payload: emptyPayload(), cached: false }
  }
}

async function computeAndCache(
  scope: MarketPulseClosedScope,
): Promise<MarketPulseClosedPayload> {
  const payload = await compute(scope)
  try {
    await writeStatsCacheRow(cacheKey(scope), payload)
  } catch (err) {
    console.warn(
      '[market-pulse-closed] cache write failed',
      err instanceof Error ? err.message : err,
    )
  }
  return payload
}

/**
 * Precompute every Market Pulse tab's Closed totals into stats_cache.
 * Called by the stats cache rebuild so the page only ever reads.
 */
export async function rebuildMarketPulseClosedCache(): Promise<{
  written: number
}> {
  let written = 0
  for (const scope of MARKET_PULSE_CLOSED_SCOPES) {
    try {
      const payload = await computeAndCache(scope)
      if (payload.rows.length > 0) written += 1
    } catch (err) {
      console.warn(
        `[market-pulse-closed] rebuild failed for ${cacheKey(scope)}`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { written }
}
