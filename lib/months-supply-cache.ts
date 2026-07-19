import 'server-only'

import { readAllListingsFromDb, readListingsFromDb } from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  LISTING_PROPERTY_CLASSES,
  listingMatchesPropertyClass,
  type ListingPropertyClass,
} from '@/lib/listing-property-class'
import { hasLocalListingsCache } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type MonthsSupplyPayload = {
  city: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
  activeCount: number
  avgMonthlyClosings: number | null
  monthsSupply: number | null
  generatedAt: string
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
    const ym = getMonthFromTimestamp(l.statusChangeTimestamp ?? l.modificationTimestamp)
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
  return {
    city,
    kind,
    propertyClass,
    activeCount,
    avgMonthlyClosings,
    monthsSupply: computeMonthsSupplyRatio(activeCount, avgMonthlyClosings),
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
 * Precompute months supply for every town × sale|rental × property class.
 * Called from rebuildStatsCache after listings are available.
 */
export async function rebuildMonthsSupplyCache(options?: {
  /** Reuse already-loaded town listings to avoid extra DB reads. */
  townListings?: Record<TmreTown, { active: Listing[]; closed: Listing[] }>
}): Promise<{ written: number; durationMs: number }> {
  const t0 = Date.now()
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0 }
  }

  const generatedAt = new Date().toISOString()
  const entries: MonthsSupplyPayload[] = []
  let written = 0

  const byTown: Record<TmreTown, { active: Listing[]; closed: Listing[] }> =
    options?.townListings ?? ({} as Record<TmreTown, { active: Listing[]; closed: Listing[] }>)

  for (const town of TMRE_TOWNS) {
    if (!byTown[town]) {
      const [active, closed] = await Promise.all([
        readListingsFromDb(town, 'Active', 500),
        readListingsFromDb(town, 'Closed', 2500),
      ])
      byTown[town] = { active, closed }
    }
    for (const kind of LISTING_KINDS) {
      for (const propertyClass of LISTING_PROPERTY_CLASSES) {
        const payload = computeMonthsSupplyPayload(
          byTown[town].active,
          byTown[town].closed,
          town,
          kind,
          propertyClass,
          generatedAt,
        )
        await writeStatsCacheRow(monthsSupplyCacheKey(town, kind, propertyClass), payload)
        entries.push(payload)
        written += 1
      }
    }
  }

  const [allActive, allClosed] = await Promise.all([
    options?.townListings
      ? Promise.resolve(TMRE_TOWNS.flatMap((t) => byTown[t].active))
      : readAllListingsFromDb(TMRE_TOWNS, 'Active'),
    options?.townListings
      ? Promise.resolve(TMRE_TOWNS.flatMap((t) => byTown[t].closed))
      : readAllListingsFromDb(TMRE_TOWNS, 'Closed'),
  ])

  for (const kind of LISTING_KINDS) {
    for (const propertyClass of LISTING_PROPERTY_CLASSES) {
      const payload = computeMonthsSupplyPayload(
        allActive,
        allClosed,
        'All',
        kind,
        propertyClass,
        generatedAt,
      )
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

  console.info(
    `[months-supply-cache] rebuilt ${entries.length} combos (+ index) in ${Date.now() - t0}ms`,
  )
  return { written, durationMs: Date.now() - t0 }
}
