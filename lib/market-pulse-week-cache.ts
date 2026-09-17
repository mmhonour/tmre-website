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
  cityKey,
  defaultMarketPulseCombinedRows,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'
import {
  overlayClosedCounts,
  overlayWeekTax,
  taxByCityFromPoints,
} from '@/lib/market-pulse-week-asof-map'
import {
  addIsoDays,
  buildMarketPulseWow,
  pickPriorSlotDate,
  type MarketPulseCompareSet,
  type MarketPulseWowCompare,
} from '@/lib/market-pulse-wow'

export type { MarketPulseCompareSet } from '@/lib/market-pulse-wow'

/**
 * One Eastern send-day of default stacked town numbers. Survives hourly
 * stats_cache clears. Archived Mondays stay frozen; the current slot is
 * live-updated only until that week's send writes a snapshot.
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

async function hydrateClosedOnCombinedRows(
  rows: MarketPulseCombinedTownRow[],
): Promise<MarketPulseCombinedTownRow[]> {
  if (rows.some((r) => r.closedCount != null)) return rows
  try {
    const { payload } = await readMarketPulseClosedCounts(
      { kind: 'sale', propertyClass: 'all' },
      { allowCompute: false },
    )
    const byCity = new Map(
      (payload.rows ?? []).map((r) => [cityKey(r.city), r.count] as const),
    )
    overlayClosedCounts(rows, byCity)
  } catch {
    // Page still renders; closed WoW chips stay blank.
  }
  return rows
}

async function persistWeekPoints(input: {
  slotDate: string
  generatedAt: string
  rows: MarketPulseWeekTownPoint[]
}): Promise<MarketPulseWeekPayload> {
  const payload: MarketPulseWeekPayload = {
    slotDate: input.slotDate,
    generatedAt: input.generatedAt,
    rows: input.rows,
  }
  await writeStatsCacheRow(marketPulseWeekCacheKey(input.slotDate), payload)
  return payload
}

async function ensurePriorWeekSlot(options: {
  slotDate: string
  taxSource: MarketPulseWeekTownPoint[]
}): Promise<{ payload: MarketPulseWeekPayload; created: boolean } | null> {
  const priorSlot = addIsoDays(options.slotDate, -7)
  const existing = await readStatsCacheRow(marketPulseWeekCacheKey(priorSlot))
  if (existing) {
    const payload = parseWeekPayload(existing.payload)
    return payload ? { payload, created: false } : null
  }
  try {
    const { reconstructMarketPulseWeekTownPoints } = await import(
      '@/lib/market-pulse-week-asof'
    )
    const reconstructed = await reconstructMarketPulseWeekTownPoints(priorSlot)
    if (reconstructed.length === 0) return null
    const rows = overlayWeekTax(
      reconstructed,
      taxByCityFromPoints(options.taxSource),
    )
    const payload = await persistWeekPoints({
      slotDate: priorSlot,
      generatedAt: new Date().toISOString(),
      rows,
    })
    return { payload, created: true }
  } catch (err) {
    console.warn(
      '[market-pulse-week] could not reconstruct prior Monday',
      priorSlot,
      err,
    )
    return null
  }
}

export async function loadMarketPulseCompares(
  current: MarketDigestSnapshot,
  now: Date = new Date(),
): Promise<MarketPulseCompareSet> {
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(now, config.weekdayEt)
  const liveRows = await hydrateClosedOnCombinedRows(
    defaultMarketPulseCombinedRows(current),
  )
  const taxSource = liveRows.map(townPointFromCombinedRow)

  const weeks = await listMarketPulseWeekPayloads(60)
  const bySlot = new Map(weeks.map((w) => [w.slotDate, w] as const))

  const snaps = await listMarketPulseSnapshots(60).catch(() => [])
  for (const snap of snaps) {
    if (bySlot.has(snap.slotDate)) continue
    const payload = await persistWeekPoints({
      slotDate: snap.slotDate,
      generatedAt: snap.generatedAt,
      rows: overlayWeekTax(
        defaultMarketPulseCombinedRows(snap.payload).map(townPointFromCombinedRow),
        taxByCityFromPoints(taxSource),
      ),
    })
    bySlot.set(snap.slotDate, payload)
  }

  if (!pickPriorSlotDate([...bySlot.keys()], slotDate, 1)) {
    const reconstructed = await ensurePriorWeekSlot({ slotDate, taxSource })
    if (reconstructed) {
      bySlot.set(reconstructed.payload.slotDate, reconstructed.payload)
    }
  }

  const slots = [...bySlot.keys()]
  const pick = (minDaysAgo: number): MarketPulseWowCompare | null => {
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
 * Freeze archived Mondays from market_pulse_snapshots. Seed a missing prior
 * Monday from listings as-of that send-day. Live numbers only fill the current
 * slot when that week has not been archived yet.
 */
export async function rebuildMarketPulseWeekCache(options?: {
  snapshot?: MarketDigestSnapshot
  now?: Date
}): Promise<{ written: number }> {
  const now = options?.now ?? new Date()
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(now, config.weekdayEt)
  let written = 0

  let snapshot = options?.snapshot ?? null
  if (!snapshot) {
    const { buildMarketDigestSnapshot } = await import('@/lib/market-digest')
    snapshot = await buildMarketDigestSnapshot()
  }
  const liveRows = await hydrateClosedOnCombinedRows(
    defaultMarketPulseCombinedRows(snapshot),
  )
  const taxSource = liveRows.map(townPointFromCombinedRow)

  const snaps = await listMarketPulseSnapshots(60).catch(() => [])
  const snapDates = new Set(snaps.map((s) => s.slotDate))
  for (const snap of snaps) {
    await persistWeekPoints({
      slotDate: snap.slotDate,
      generatedAt: snap.generatedAt,
      rows: overlayWeekTax(
        defaultMarketPulseCombinedRows(snap.payload).map(
          townPointFromCombinedRow,
        ),
        taxByCityFromPoints(taxSource),
      ),
    })
    written += 1
  }

  if (!snapDates.has(slotDate)) {
    await upsertMarketPulseWeekCache({
      slotDate,
      generatedAt: snapshot.generatedAt,
      rows: liveRows,
    })
    written += 1
  }

  const prior = await ensurePriorWeekSlot({ slotDate, taxSource })
  if (prior?.created) written += 1

  return { written }
}
