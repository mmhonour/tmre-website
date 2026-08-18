import 'server-only'

import { readClosedCountsByTown } from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import {
  MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
  type MarketDigestClosedTownCount,
} from '@/lib/market-digest-types'
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID,
  marketPulseLookbackById,
  marketPulseLookbackChartLabel,
  type MarketPulseLookbackId,
} from '@/lib/market-pulse-lookback'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/**
 * Closed-sales-by-town totals are a two-year aggregate over every Closed row,
 * which measures 2–6s per property class. Market Pulse has 500'd on Netlify
 * before by doing Closed work inline, so the 24mo axis window is cached here
 * and fetched by the client per tab. The page-load default (12mo) and shorter
 * lookbacks compute on demand (and are also written during stats rebuild).
 */
const TTL_MS = 6 * 60 * 60 * 1000

export type MarketPulseClosedScope = {
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
  /** Trailing day window; default = page-load 12mo. */
  lookbackId?: MarketPulseLookbackId
}

export type MarketPulseClosedPayload = {
  /** Legacy months field for the 24mo axis cache readers. */
  months: number
  days: number
  lookbackId: MarketPulseLookbackId
  lookbackLabel: string
  rows: MarketDigestClosedTownCount[]
  generatedAt: string
}

/**
 * One scope per Market Pulse tab (mirrors CLOSED_QUERY in MarketPulseContent).
 * The stats-cache rebuild precomputes the 12mo default and 24mo axis windows.
 */
export const MARKET_PULSE_CLOSED_SCOPES: readonly MarketPulseClosedScope[] = [
  { kind: 'sale', propertyClass: 'all' },
  { kind: 'sale', propertyClass: 'homes' },
  { kind: 'sale', propertyClass: 'condos' },
  { kind: 'rental', propertyClass: 'all' },
  { kind: 'sale', commercialOnly: true },
]

function resolveLookback(scope: MarketPulseClosedScope) {
  const lookbackId = scope.lookbackId ?? DEFAULT_MARKET_PULSE_LOOKBACK_ID
  const lookback = marketPulseLookbackById(lookbackId)
  return { lookbackId, lookback }
}

function cacheKey(scope: MarketPulseClosedScope): string {
  const slice = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  const { lookbackId, lookback } = resolveLookback(scope)
  // 24mo axis keeps the v3 key so existing stats_cache rows still hit.
  if (lookbackId === MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID) {
    return `market-pulse-closed:${scope.kind}:${slice}:${MARKET_DIGEST_CLOSED_TRAILING_MONTHS}m:v3`
  }
  return `market-pulse-closed:${scope.kind}:${slice}:${lookback.days}d:v5`
}

function windowCopy(days: number, label: string): string {
  return days >= 30 && days % 30 === 0
    ? `trailing ${label}`
    : `trailing ${label} (${days} days)`
}

async function compute(
  scope: MarketPulseClosedScope,
): Promise<MarketPulseClosedPayload> {
  const { lookbackId, lookback } = resolveLookback(scope)
  const days = lookback.days
  const label = lookback.label
  const months =
    lookbackId === MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID
      ? MARKET_DIGEST_CLOSED_TRAILING_MONTHS
      : Math.max(1, Math.round(days / 30))

  const rows = await readClosedCountsByTown({
    towns: TMRE_TOWNS,
    days,
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
  const win = windowCopy(days, label)
  const townRows: MarketDigestClosedTownCount[] = rows.map((row) => ({
    city: row.town,
    count: row.count,
    calc: {
      summary: `${row.count.toLocaleString()} ${noun} in ${row.town} over the ${win}.`,
      detail: [
        `Postgres count of Closed listings with close date in the ${win} window (${classLabel}).`,
      ],
      inputs: {
        city: row.town,
        count: row.count,
        days,
        months,
        lookbackId,
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
      summary: `${total.toLocaleString()} ${noun} across all ${townRows.length} TMRE towns over the ${win}.`,
      detail: [
        `Sum of the per-town Closed counts below (${classLabel}), same ${win} window.`,
        lookbackId === MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID
          ? 'Precomputed by the stats cache rebuild — the page reads it, never recounts it.'
          : 'Computed on demand for this lookback window and cached for a few hours.',
      ],
      inputs: {
        city: 'All',
        count: total,
        towns: townRows.length,
        days,
        months,
        lookbackId,
        kind: scope.kind,
        propertyClass: scope.propertyClass ?? null,
        commercialOnly: scope.commercialOnly ?? false,
      },
    },
  }

  return {
    months,
    days,
    lookbackId,
    lookbackLabel: marketPulseLookbackChartLabel(lookbackId),
    rows: townRows.length > 0 ? [allRow, ...townRows] : [],
    generatedAt: new Date().toISOString(),
  }
}

function emptyPayload(
  lookbackId: MarketPulseLookbackId = DEFAULT_MARKET_PULSE_LOOKBACK_ID,
): MarketPulseClosedPayload {
  const lookback = marketPulseLookbackById(lookbackId)
  return {
    months:
      lookbackId === MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID
        ? MARKET_DIGEST_CLOSED_TRAILING_MONTHS
        : Math.max(1, Math.round(lookback.days / 30)),
    days: lookback.days,
    lookbackId,
    lookbackLabel: lookback.label,
    rows: [],
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Cached totals. Read-only for the 24mo axis window unless `allowCompute`.
 * Other lookbacks (including the 12mo page default) compute on demand so the
 * slider works without a full stats rebuild for every option.
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
  const { lookbackId } = resolveLookback(scope)
  const isAxis = lookbackId === MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID
  const allowCompute = options.allowCompute ?? !isAxis
  const key = cacheKey(scope)
  let stale: MarketPulseClosedPayload | null = null

  try {
    const row = await readStatsCacheRow(key)
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as MarketPulseClosedPayload
      // Older v3 payloads lack days/lookbackId — normalize on read.
      if (parsed.days == null) {
        parsed.days = marketPulseLookbackById(
          MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID,
        ).days
        parsed.lookbackId = MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID
        parsed.lookbackLabel = marketPulseLookbackChartLabel(
          MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID,
        )
      }
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

  if (!allowCompute) {
    // Stale beats empty; empty beats a 26s aggregate on the read path.
    if (stale) return { payload: stale, cached: true }
    return {
      payload: emptyPayload(lookbackId),
      cached: false,
      needsRebuild: true,
    }
  }

  try {
    return { payload: await computeAndCache(scope), cached: false }
  } catch (err) {
    console.warn(
      '[market-pulse-closed] compute failed',
      err instanceof Error ? err.message : err,
    )
    if (stale) return { payload: stale, cached: true }
    return { payload: emptyPayload(lookbackId), cached: false }
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
 * Precompute every Market Pulse tab's 12mo default and 24mo axis Closed totals.
 */
export async function rebuildMarketPulseClosedCache(): Promise<{
  written: number
}> {
  const lookbacks: MarketPulseLookbackId[] = [
    DEFAULT_MARKET_PULSE_LOOKBACK_ID,
    MARKET_PULSE_CLOSED_AXIS_LOOKBACK_ID,
  ]
  let written = 0
  for (const scope of MARKET_PULSE_CLOSED_SCOPES) {
    for (const lookbackId of lookbacks) {
      try {
        const payload = await computeAndCache({
          ...scope,
          lookbackId,
        })
        if (payload.rows.length > 0) written += 1
      } catch (err) {
        console.warn(
          `[market-pulse-closed] rebuild failed for ${cacheKey({ ...scope, lookbackId })}`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }
  return { written }
}
