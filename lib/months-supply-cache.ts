import 'server-only'

import { readStatsListingsFromDb } from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { closeFieldsFromListing } from '@/lib/listing-history'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  LISTING_PROPERTY_CLASSES,
  listingMatchesPropertyClass,
  type ListingPropertyClass,
} from '@/lib/listing-property-class'
import { hasLocalListingsCache } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import type { StatsValueCalc } from '@/lib/stats-compute'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'

export type { MonthsSupplyPayload } from '@/lib/months-supply-types'

/** Build cached hover methodology for inventory / months-supply bars. */
export function monthsSupplyValueCalcs(args: {
  city: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
  activeCount: number
  avgMonthlyClosings: number | null
  monthsSupply: number | null
}): {
  activeCountCalc: StatsValueCalc
  monthsSupplyCalc?: StatsValueCalc
} {
  const classLabel =
    args.propertyClass === 'all' ? 'all property types' : args.propertyClass
  const kindNoun = args.kind === 'rental' ? 'rentals' : 'for-sale listings'
  const activeCountCalc: StatsValueCalc = {
    summary: `${args.activeCount.toLocaleString()} active ${kindNoun} in ${args.city} (${classLabel}).`,
    detail: [
      'Count of Active listings matching the tab’s kind and property class at cache rebuild.',
    ],
    inputs: {
      city: args.city,
      kind: args.kind,
      propertyClass: args.propertyClass,
      activeCount: args.activeCount,
    },
  }
  if (
    args.monthsSupply == null ||
    args.avgMonthlyClosings == null ||
    args.avgMonthlyClosings <= 0
  ) {
    return { activeCountCalc }
  }
  const avg = args.avgMonthlyClosings
  const avgLabel = avg % 1 === 0 ? String(avg) : avg.toFixed(1)
  return {
    activeCountCalc,
    monthsSupplyCalc: {
      summary: `${args.activeCount.toLocaleString()} active ÷ ${avgLabel} avg monthly closings = ${args.monthsSupply.toFixed(1)} mo supply in ${args.city}.`,
      detail: [
        'Avg monthly closings = mean Closed count over the prior 3 full calendar months (same kind / property class).',
        'Months supply = active inventory ÷ that average.',
      ],
      inputs: {
        city: args.city,
        kind: args.kind,
        propertyClass: args.propertyClass,
        activeCount: args.activeCount,
        avgMonthlyClosings: avg,
        monthsSupply: args.monthsSupply,
      },
    },
  }
}

export type MonthsSupplyIndexPayload = {
  generatedAt: string
  /** town × kind × propertyClass → payload */
  entries: MonthsSupplyPayload[]
  expectedCount: number
}

/** Formula used site-wide: active inventory ÷ trailing 3-month avg closings. */
export function computeMonthsSupplyRatio(
  activeCount: number,
  avgMonthlyClosings: number | null | undefined,
): number | null {
  if (!avgMonthlyClosings || avgMonthlyClosings <= 0) return null
  if (!Number.isFinite(activeCount) || activeCount < 0) return null
  return activeCount / avgMonthlyClosings
}

export function monthsSupplyCacheKey(
  city: string,
  kind: ListingKind,
  propertyClass: ListingPropertyClass,
): string {
  return `months-supply:${city}:${kind}:${propertyClass}`
}

export const MONTHS_SUPPLY_INDEX_KEY = 'months-supply-index:All:all'

/** Towns × sale/rental × (All|Homes|Multi|Condos). */
export function expectedMonthsSupplyCacheCount(includeAllTowns = true): number {
  const townCount = TMRE_TOWNS.length + (includeAllTowns ? 1 : 0)
  return townCount * LISTING_KINDS.length * LISTING_PROPERTY_CLASSES.length
}

function filterByPropertyClass(
  listings: readonly Listing[],
  propertyClass: ListingPropertyClass,
): Listing[] {
  if (propertyClass === 'all') return [...listings]
  return listings.filter((l) => listingMatchesPropertyClass(l.propertyType ?? '', propertyClass))
}

function getMonthFromTimestamp(ts: string | null | undefined): { year: number; month: number } | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/** Trailing 3 full calendar months average of closed counts. */
export function avgMonthlyClosingsFromClosed(
  closed: readonly Listing[],
  now: Date = new Date(),
): number | null {
  const counts = new Map<string, number>()
  for (const l of closed) {
    const { closeDate } = closeFieldsFromListing(l)
    const ym = getMonthFromTimestamp(
      closeDate ?? l.statusChangeTimestamp ?? l.modificationTimestamp,
    )
    if (!ym) continue
    const key = `${ym.year}-${ym.month}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const recent: number[] = []
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    recent.push(counts.get(key) ?? 0)
  }
  if (!recent.some((n) => n > 0)) return null
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

export function computeMonthsSupplyPayload(
  active: readonly Listing[],
  closed: readonly Listing[],
  city: string,
  kind: ListingKind,
  propertyClass: ListingPropertyClass,
  generatedAt: string = new Date().toISOString(),
): MonthsSupplyPayload {
  const kindActive = filterListingsByKind(active, kind)
  const kindClosed = filterListingsByKind(closed, kind)
  const filteredActive = filterByPropertyClass(kindActive, propertyClass)
  const filteredClosed = filterByPropertyClass(kindClosed, propertyClass)
  const activeCount = filteredActive.length
  const avgMonthlyClosings = avgMonthlyClosingsFromClosed(filteredClosed)
  const monthsSupply = computeMonthsSupplyRatio(activeCount, avgMonthlyClosings)
  const calcs = monthsSupplyValueCalcs({
    city,
    kind,
    propertyClass,
    activeCount,
    avgMonthlyClosings,
    monthsSupply,
  })
  return {
    city,
    kind,
    propertyClass,
    activeCount,
    activeCountCalc: calcs.activeCountCalc,
    avgMonthlyClosings,
    monthsSupply,
    monthsSupplyCalc: calcs.monthsSupplyCalc,
    generatedAt,
  }
}

export async function readMonthsSupplyCached(
  city: string,
  kind: ListingKind,
  propertyClass: ListingPropertyClass = 'all',
): Promise<MonthsSupplyPayload | null> {
  if (!(await hasLocalListingsCache())) return null
  const row = await readStatsCacheRow(monthsSupplyCacheKey(city, kind, propertyClass))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as MonthsSupplyPayload
  } catch {
    return null
  }
}

export async function readMonthsSupplyIndex(): Promise<MonthsSupplyIndexPayload | null> {
  if (!(await hasLocalListingsCache())) return null
  const row = await readStatsCacheRow(MONTHS_SUPPLY_INDEX_KEY)
  if (!row) return null
  try {
    return JSON.parse(row.payload) as MonthsSupplyIndexPayload
  } catch {
    return null
  }
}

/**
 * Combine per-town months-supply payloads into one scope.
 *
 * Both inputs are additive: inventory is a count, and average monthly closings
 * is a sum of closed counts ÷ 3, so the market average is the sum of the town
 * averages. The ratio is then recomputed from those sums — averaging the towns'
 * ratios would weight a seven-listing town the same as a seven-hundred one. A
 * town whose average is null had no closings in the window, which contributes
 * zero rather than making the market average unknown.
 */
export function rollupMonthsSupply(
  parts: readonly MonthsSupplyPayload[],
  city: string,
  kind: ListingKind,
  propertyClass: ListingPropertyClass,
  generatedAt: string,
): MonthsSupplyPayload {
  const activeCount = parts.reduce((total, part) => total + (part.activeCount || 0), 0)
  const closingParts = parts.filter((part) => part.avgMonthlyClosings != null)
  const avgMonthlyClosings =
    closingParts.length > 0
      ? closingParts.reduce((total, part) => total + (part.avgMonthlyClosings ?? 0), 0)
      : null
  const monthsSupply = computeMonthsSupplyRatio(activeCount, avgMonthlyClosings)
  const calcs = monthsSupplyValueCalcs({
    city,
    kind,
    propertyClass,
    activeCount,
    avgMonthlyClosings,
    monthsSupply,
  })
  return {
    city,
    kind,
    propertyClass,
    activeCount,
    activeCountCalc: calcs.activeCountCalc,
    avgMonthlyClosings,
    monthsSupply,
    monthsSupplyCalc: calcs.monthsSupplyCalc,
    generatedAt,
  }
}

/**
 * Write one town's kind × property-class payloads.
 *
 * Called from inside the stats rebuild's town loop, while that town's listings
 * are already in hand. Doing it there is the point: the previous version was
 * handed every town's listings at once so it could concatenate them for the All
 * row, which meant the whole market sat in the heap for the length of the
 * rebuild.
 */
export async function writeMonthsSupplyForTown(
  town: TmreTown,
  active: readonly Listing[],
  closed: readonly Listing[],
  generatedAt: string,
): Promise<number> {
  let written = 0
  for (const kind of LISTING_KINDS) {
    for (const propertyClass of LISTING_PROPERTY_CLASSES) {
      const payload = computeMonthsSupplyPayload(
        active,
        closed,
        town,
        kind,
        propertyClass,
        generatedAt,
      )
      await writeStatsCacheRow(monthsSupplyCacheKey(town, kind, propertyClass), payload)
      written += 1
    }
  }
  return written
}

/**
 * Sum the cached town rows into the All rows and republish the index.
 *
 * Reads the town payloads back out of stats_cache rather than keeping them in
 * memory, so it works the same whether one town or all seven were just
 * recomputed — an untouched town's row is still current.
 */
export async function finalizeMonthsSupplyCache(
  generatedAt: string,
): Promise<{ written: number }> {
  let written = 0
  const entries: MonthsSupplyPayload[] = []

  for (const kind of LISTING_KINDS) {
    for (const propertyClass of LISTING_PROPERTY_CLASSES) {
      const parts: MonthsSupplyPayload[] = []
      for (const town of TMRE_TOWNS) {
        const cached = await readMonthsSupplyCached(town, kind, propertyClass)
        if (!cached) continue
        parts.push(cached)
        entries.push(cached)
      }
      if (parts.length < TMRE_TOWNS.length) {
        console.warn(
          `[months-supply-cache] All:${kind}:${propertyClass} rolled up from ${parts.length}/${TMRE_TOWNS.length} towns`,
        )
      }
      const payload = rollupMonthsSupply(parts, 'All', kind, propertyClass, generatedAt)
      await writeStatsCacheRow(monthsSupplyCacheKey('All', kind, propertyClass), payload)
      entries.push(payload)
      written += 1
    }
  }

  const index: MonthsSupplyIndexPayload = {
    generatedAt,
    entries,
    expectedCount: expectedMonthsSupplyCacheCount(true),
  }
  await writeStatsCacheRow(MONTHS_SUPPLY_INDEX_KEY, index)
  written += 1
  return { written }
}

/**
 * Precompute months supply for `towns` (default: all), then the All rows.
 *
 * Standalone entry point — the stats rebuild instead calls
 * writeMonthsSupplyForTown() per town and finalizeMonthsSupplyCache() once, so
 * it never holds more than one town's listings at a time.
 */
export async function rebuildMonthsSupplyCache(options?: {
  /** Towns to recompute; defaults to every town. */
  towns?: readonly TmreTown[]
}): Promise<{ written: number; durationMs: number }> {
  const t0 = Date.now()
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0 }
  }

  const generatedAt = new Date().toISOString()
  const requested = options?.towns ? [...new Set(options.towns)] : []
  const targets = requested.length > 0 ? requested : TMRE_TOWNS
  let written = 0

  for (const town of targets) {
    const [active, closed] = await Promise.all([
      // Uncapped: a price-DESC sample drops recent mid-market inventory, and the
      // All row is the sum of these towns.
      readStatsListingsFromDb(town, 'Active'),
      readStatsListingsFromDb(town, 'Closed'),
    ])
    written += await writeMonthsSupplyForTown(town, active, closed, generatedAt)
  }

  const final = await finalizeMonthsSupplyCache(generatedAt)
  written += final.written

  console.info(
    `[months-supply-cache] rebuilt ${targets.length} town(s) + All (+ index) in ${Date.now() - t0}ms`,
  )
  return { written, durationMs: Date.now() - t0 }
}
