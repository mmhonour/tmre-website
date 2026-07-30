import { latestActivityMs } from '@/lib/latest-activity'
import { isLatestEventStatus } from '@/lib/latest-status-rules'
import {
  TMRE_TOWNS,
  isTmreTown,
  normalizeTownName,
  type TmreTown,
} from '@/lib/tmre-towns'

export { isLatestEventStatus } from '@/lib/latest-status-rules'

/** Minimal fields needed to enforce one-latest-per-town coverage. */
export type LatestCoverageRow = {
  key: string
  town: string | null
  city: string | null
  modificationTimestamp: string | null
  listDate: string | null
  /** Feed status when the caller has one (LatestListingRow) — drives event ranking. */
  status?: string
}

/** Latest must surface MLS activity from this window when it exists in Postgres. */
export const LATEST_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

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

/**
 * Feed ordering: last-24h activity first (so the ticker stays "latest" and the
 * 24h cache-validity check keeps passing). Recency is preserved inside every
 * group. /latest only passes event rows, so the "rest" buckets stay empty.
 */
export function rankLatestFeedRows<T extends LatestCoverageRow>(
  rows: readonly T[],
  nowMs = Date.now(),
): T[] {
  const cutoff = nowMs - LATEST_FRESH_WINDOW_MS
  const freshEvents: T[] = []
  const freshRest: T[] = []
  const olderEvents: T[] = []
  const olderRest: T[] = []
  for (const row of sortByActivityDesc(rows)) {
    const activity = latestActivityMs(row.modificationTimestamp, row.listDate)
    const fresh = !Number.isNaN(activity) && activity >= cutoff
    const event = isLatestEventStatus(row.status)
    if (fresh) (event ? freshEvents : freshRest).push(row)
    else (event ? olderEvents : olderRest).push(row)
  }
  return [...freshEvents, ...freshRest, ...olderEvents, ...olderRest]
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
 * Keep the usual events-then-newest ranking, but guarantee each TMRE town
 * appears at least once (its top-ranked row from `rows` / `extras`) so quiet
 * towns are never squeezed out of the 30-slot ticker.
 */
export function ensureMinOneListingPerTmreTown<T extends LatestCoverageRow>(
  rows: readonly T[],
  cap: number,
  extras: readonly T[] = [],
): T[] {
  const limit = Math.max(1, cap)
  const pool = rankLatestFeedRows([...rows, ...extras])
  if (pool.length === 0) return []

  const topByTown = new Map<TmreTown, T>()
  for (const row of pool) {
    const town = rowTown(row)
    if (!town || topByTown.has(town)) continue
    topByTown.set(town, row)
  }

  const seeds = rankLatestFeedRows(
    TMRE_TOWNS.map((town) => topByTown.get(town)).filter(
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

  return rankLatestFeedRows(picked)
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
