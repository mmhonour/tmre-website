import 'server-only'

import {
  listStatsCacheByPrefix,
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { listMarketPulseSnapshots } from '@/lib/db/market-pulse-snapshots-repo'
import {
  getMarketDigestConfigFresh,
  marketDigestWeekKey,
} from '@/lib/market-digest-config'
import type { MarketDigestSnapshot } from '@/lib/market-digest-types'
import {
  defaultMarketPulseCombinedRows,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import {
  buildMarketPulseWow,
  pickPriorSlotDate,
  type MarketPulseCompareSet,
  type MarketPulseWowCompare,
} from '@/lib/market-pulse-wow'

export type { MarketPulseCompareSet } from '@/lib/market-pulse-wow'

/**
 * One Eastern send-day of default stacked town numbers. Survives hourly
 * stats_cache clears. Current slot is upserted on rebuild; older slots stay
 * so WoW / MoM / YoY can walk backwards.
 */
export const MARKET_PULSE_WEEK_KEY_PREFIX = 'market-pulse-week:sale:all:v1:'

export type MarketPulseWeekTownPoint = {
  city: string
  activeCount: number | null
  monthsSupply: number | null
  avgDaysOnMarket: number | null
  closedCount: number | null
  medianPrice: number | null
  averagePrice: number | null
  priceDelta: number | null
  saleToAskDollars: number | null
  medianTax: number | null
  averageTax: number | null
  taxDelta: number | null
}

export type MarketPulseWeekPayload = {
  slotDate: string
  generatedAt: string
  rows: MarketPulseWeekTownPoint[]
}

export function marketPulseWeekCacheKey(slotDate: string): string {
  return `${MARKET_PULSE_WEEK_KEY_PREFIX}${slotDate}`
}

export function townPointFromCombinedRow(
  row: MarketPulseCombinedTownRow,
): MarketPulseWeekTownPoint {
  return {
    city: row.city,
    activeCount: row.activeCount,
    monthsSupply: row.monthsSupply,
    avgDaysOnMarket: row.avgDaysOnMarket,
    closedCount: row.closedCount,
    medianPrice: row.medianPrice,
    averagePrice: row.averagePrice,
    priceDelta: row.priceDelta,
    saleToAskDollars: row.saleToAskDollars,
    medianTax: row.medianTax,
    averageTax: row.averageTax,
    taxDelta: row.taxDelta,
  }
}

export function combinedRowFromTownPoint(
  point: MarketPulseWeekTownPoint,
): MarketPulseCombinedTownRow {
  return {
    city: point.city,
    activeCount: point.activeCount,
    monthsSupply: point.monthsSupply,
    avgDaysOnMarket: point.avgDaysOnMarket,
    closedCount: point.closedCount,
    medianPrice: point.medianPrice,
    averagePrice: point.averagePrice,
    priceDelta: point.priceDelta,
    priceDeltaPct: null,
    saleToAskPct: null,
    saleToAskDollars: point.saleToAskDollars,
    medianTax: point.medianTax,
    averageTax: point.averageTax,
    taxDelta: point.taxDelta,
    taxDeltaPct: null,
  }
}

export async function upsertMarketPulseWeekCache(input: {
  slotDate: string
  generatedAt: string
  rows: MarketPulseCombinedTownRow[]
}): Promise<void> {
  const payload: MarketPulseWeekPayload = {
    slotDate: input.slotDate,
    generatedAt: input.generatedAt,
    rows: input.rows.map(townPointFromCombinedRow),
  }
  await writeStatsCacheRow(marketPulseWeekCacheKey(input.slotDate), payload)
}

function parseWeekPayload(raw: string): MarketPulseWeekPayload | null {
  try {
    const parsed = JSON.parse(raw) as MarketPulseWeekPayload
    if (!parsed?.slotDate || !Array.isArray(parsed.rows)) return null
    return parsed
  } catch {
    return null
  }
}

export async function listMarketPulseWeekPayloads(
  limit = 60,
): Promise<MarketPulseWeekPayload[]> {
  const rows = await listStatsCacheByPrefix(MARKET_PULSE_WEEK_KEY_PREFIX, limit)
  return rows
    .map((row) => parseWeekPayload(row.payload))
    .filter((p): p is MarketPulseWeekPayload => p != null)
    .sort((a, b) => b.slotDate.localeCompare(a.slotDate))
}

export async function loadMarketPulseCompares(
  current: MarketDigestSnapshot,
  now: Date = new Date(),
): Promise<MarketPulseCompareSet> {
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(now, config.weekdayEt)
  const liveRows = defaultMarketPulseCombinedRows(current)
  const weeks = await listMarketPulseWeekPayloads(60)
  const slots = weeks.map((w) => w.slotDate)
  const bySlot = new Map(weeks.map((w) => [w.slotDate, w] as const))

  const pick = (
    minDaysAgo: number,
  ): MarketPulseWowCompare | null => {
    const priorSlot = pickPriorSlotDate(slots, slotDate, minDaysAgo)
    if (!priorSlot) return null
    const prior = bySlot.get(priorSlot)
    if (!prior) return null
    return buildMarketPulseWow(
      liveRows,
      prior.rows.map(combinedRowFromTownPoint),
      prior.slotDate,
    )
  }

  return {
    wow: pick(1),
    mom: pick(28),
    yoy: pick(350),
  }
}

/**
 * Write this week's stacked defaults. Seed missing older Mondays from
 * market_pulse_snapshots so a timeline exists before two rebuilds land.
 */
export async function rebuildMarketPulseWeekCache(options?: {
  snapshot?: MarketDigestSnapshot
  now?: Date
}): Promise<{ written: number }> {
  const now = options?.now ?? new Date()
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(now, config.weekdayEt)
  let written = 0

  const snaps = await listMarketPulseSnapshots(60).catch(() => [])
  for (const snap of snaps) {
    const key = marketPulseWeekCacheKey(snap.slotDate)
    const existing = await readStatsCacheRow(key)
    if (existing) continue
    await upsertMarketPulseWeekCache({
      slotDate: snap.slotDate,
      generatedAt: snap.generatedAt,
      rows: defaultMarketPulseCombinedRows(snap.payload),
    })
    written += 1
  }

  let snapshot = options?.snapshot ?? null
  if (!snapshot) {
    const { buildMarketDigestSnapshot } = await import('@/lib/market-digest')
    snapshot = await buildMarketDigestSnapshot()
  }
  await upsertMarketPulseWeekCache({
    slotDate,
    generatedAt: snapshot.generatedAt,
    rows: defaultMarketPulseCombinedRows(snapshot),
  })
  written += 1
  return { written }
}
