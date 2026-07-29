import { latestActivityMs } from '@/lib/latest-activity'
import {
  TMRE_TOWNS,
  isTmreTown,
  normalizeTownName,
  type TmreTown,
} from '@/lib/tmre-towns'

/** Minimal fields needed to enforce one-latest-per-town coverage. */
export type LatestCoverageRow = {
  key: string
  town: string | null
  city: string | null
  modificationTimestamp: string | null
  listDate: string | null
}

function rowTown(row: LatestCoverageRow): TmreTown | null {
  const fromTown = normalizeTownName(row.town)
  if (fromTown && isTmreTown(fromTown)) return fromTown
  const fromCity = normalizeTownName(row.city)
  if (fromCity && isTmreTown(fromCity)) return fromCity
  return null
}

function sortByActivityDesc<T extends LatestCoverageRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = latestActivityMs(a.modificationTimestamp, a.listDate)
    const tb = latestActivityMs(b.modificationTimestamp, b.listDate)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}

/** True when every TMRE town has at least one listing in the feed. */
export function feedCoversAllTmreTowns(
  rows: readonly LatestCoverageRow[],
): boolean {
  if (rows.length === 0) return false
  const seen = new Set<TmreTown>()
  for (const row of rows) {
    const town = rowTown(row)
    if (town) seen.add(town)
  }
  return TMRE_TOWNS.every((town) => seen.has(town))
}

/**
 * Keep the usual newest-first ranking, but guarantee each TMRE town appears
 * at least once (its newest row from `rows` / `extras`) so quiet towns are
 * never squeezed out of the 30-slot ticker.
 */
export function ensureMinOneListingPerTmreTown<T extends LatestCoverageRow>(
  rows: readonly T[],
  cap: number,
  extras: readonly T[] = [],
): T[] {
  const limit = Math.max(1, cap)
  const pool = sortByActivityDesc([...rows, ...extras])
  if (pool.length === 0) return []

  const newestByTown = new Map<TmreTown, T>()
  for (const row of pool) {
    const town = rowTown(row)
    if (!town || newestByTown.has(town)) continue
    newestByTown.set(town, row)
  }

  const seeds = sortByActivityDesc(
    TMRE_TOWNS.map((town) => newestByTown.get(town)).filter(
      (row): row is T => row != null,
    ),
  )

  const picked: T[] = []
  const seen = new Set<string>()
  for (const row of seeds) {
    if (!row.key || seen.has(row.key)) continue
    picked.push(row)
    seen.add(row.key)
  }

  for (const row of pool) {
    if (picked.length >= limit) break
    if (!row.key || seen.has(row.key)) continue
    picked.push(row)
    seen.add(row.key)
  }

  return sortByActivityDesc(picked)
}

/** Towns among TMRE_TOWNS that have no row in the feed yet. */
export function missingTmreTowns(
  rows: readonly LatestCoverageRow[],
): TmreTown[] {
  const seen = new Set<TmreTown>()
  for (const row of rows) {
    const town = rowTown(row)
    if (town) seen.add(town)
  }
  return TMRE_TOWNS.filter((town) => !seen.has(town))
}
