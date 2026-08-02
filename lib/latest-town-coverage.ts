import { latestRowActivityMs } from '@/lib/latest-activity'
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
  /** Badge-specific event clock (e.g. PriceChangeTimestamp for Reduced). */
  eventAt?: string | null
  /** Feed status when the caller has one (LatestListingRow) — drives event ranking. */
  status?: string
}

/**
 * Cache / pull freshness window (not the feed fill order). Feed fill uses
 * Eastern calendar today → prior day; this window still rejects stale warm cache.
 */
export const LATEST_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

const ET = 'America/New_York'

function rowTown(row: LatestCoverageRow): TmreTown | null {
  const fromTown = normalizeTownName(row.town)
  if (fromTown && isTmreTown(fromTown)) return fromTown
  const fromCity = normalizeTownName(row.city)
  if (fromCity && isTmreTown(fromCity)) return fromCity
  return null
}

function sortByActivityDesc<T extends LatestCoverageRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = latestRowActivityMs(a)
    const tb = latestRowActivityMs(b)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}

/** YYYY-MM-DD in America/New_York for an activity instant. */
export function easternCalendarDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/** Prior Eastern calendar day relative to `nowMs`. */
export function priorEasternCalendarDayKey(nowMs: number): string {
  const today = easternCalendarDayKey(nowMs)
  for (let hours = 1; hours <= 48; hours++) {
    const key = easternCalendarDayKey(nowMs - hours * 60 * 60 * 1000)
    if (key !== today) return key
  }
  return today
}

/**
 * Feed ordering after badges: Eastern calendar today (timestamp desc), then
 * the prior day (timestamp desc), then older days. Events stay ahead of any
 * non-event rows inside each day bucket (global /latest only passes events).
 */
export function rankLatestFeedRows<T extends LatestCoverageRow>(
  rows: readonly T[],
  nowMs = Date.now(),
): T[] {
  const todayKey = easternCalendarDayKey(nowMs)
  const priorKey = priorEasternCalendarDayKey(nowMs)

  const todayEvents: T[] = []
  const todayRest: T[] = []
  const priorEvents: T[] = []
  const priorRest: T[] = []
  const olderEvents: T[] = []
  const olderRest: T[] = []

  for (const row of sortByActivityDesc(rows)) {
    const activity = latestRowActivityMs(row)
    const dayKey = Number.isNaN(activity)
      ? null
      : easternCalendarDayKey(activity)
    const event = isLatestEventStatus(row.status)
    if (dayKey === todayKey) {
      ;(event ? todayEvents : todayRest).push(row)
    } else if (dayKey === priorKey) {
      ;(event ? priorEvents : priorRest).push(row)
    } else {
      ;(event ? olderEvents : olderRest).push(row)
    }
  }

  return [
    ...todayEvents,
    ...todayRest,
    ...priorEvents,
    ...priorRest,
    ...olderEvents,
    ...olderRest,
  ]
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
