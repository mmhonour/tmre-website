/**
 * Client-safe Closed lookback helpers. Town stats are range-sums of
 * precomputed daily buckets — never a live listings aggregate.
 */

import { TMRE_TOWNS, isTmreTown, normalizeZip } from '@/lib/tmre-towns'

export const CLOSED_LOOKBACK_MONTHS = 24
export const CLOSED_DEFAULT_DAYS = 30
export const CLOSED_FEED_LIMIT = 30
export const CLOSED_TOWN_EXPAND_LIMIT = 30

export type ClosedDayZipBucket = {
  zip: string
  count: number
}

export type ClosedDayBucket = {
  town: string
  /** Eastern calendar day YYYY-MM-DD */
  day: string
  count: number
  latestListingId: string | null
  latestListingAddress: string | null
  latestCloseAt: string | null
  zips: ClosedDayZipBucket[]
}

export type ClosedTownStat = {
  town: string
  updateCount: number
  latestUpdate: string | null
  latestListingId: string | null
  latestListingAddress: string | null
  zips: { zip: string; updateCount: number; latestUpdate: string | null }[]
}

export type ClosedDailyCachePayload = {
  version: 1
  generatedAt: string
  horizonStart: string
  horizonEnd: string
  buckets: ClosedDayBucket[]
}

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: 'numeric',
})

export function easternDateKey(at: Date = new Date()): string {
  return ET_DATE_FMT.format(at)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Calendar-day arithmetic on a YYYY-MM-DD key (no timezone rollback). */
export function addEasternDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta, 12))
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`
}

export function closedHorizonDays(now: Date = new Date()): string[] {
  const end = easternDateKey(now)
  const [ey, em, ed] = end.split('-').map(Number)
  const from = addEasternDays(
    `${ey ?? 1970}-${pad2(em ?? 1)}-${pad2(ed ?? 1)}`,
    -(CLOSED_LOOKBACK_MONTHS * 31),
  )
  const target = addEasternDays(end, 0)
  // Walk from ~24 months back; clamp start to the same ET month/day two years ago.
  const start = `${String((ey ?? 1970) - 2).padStart(4, '0')}-${pad2(em ?? 1)}-${pad2(ed ?? 1)}`
  const days: string[] = []
  let cursor = start < from ? start : from
  if (cursor > target) cursor = target
  while (cursor <= end) {
    days.push(cursor)
    cursor = addEasternDays(cursor, 1)
  }
  return days
}

export function defaultClosedRange(now: Date = new Date()): {
  from: string
  to: string
} {
  const to = easternDateKey(now)
  return { from: addEasternDays(to, -(CLOSED_DEFAULT_DAYS - 1)), to }
}

export function formatClosedDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Inclusive range-sum of precomputed daily buckets. No listing math. */
export function sliceClosedTownStats(
  buckets: readonly ClosedDayBucket[],
  fromDay: string,
  toDay: string,
): ClosedTownStat[] {
  const from = fromDay <= toDay ? fromDay : toDay
  const to = fromDay <= toDay ? toDay : fromDay
  const byTown = new Map<
    string,
    {
      count: number
      latestCloseAt: string | null
      latestListingId: string | null
      latestListingAddress: string | null
      zips: Map<string, number>
    }
  >()

  for (const town of TMRE_TOWNS) {
    byTown.set(town, {
      count: 0,
      latestCloseAt: null,
      latestListingId: null,
      latestListingAddress: null,
      zips: new Map(),
    })
  }

  for (const bucket of buckets) {
    if (bucket.day < from || bucket.day > to) continue
    if (!isTmreTown(bucket.town)) continue
    const row = byTown.get(bucket.town)
    if (!row) continue
    row.count += bucket.count
    if (
      bucket.latestCloseAt &&
      (!row.latestCloseAt || bucket.latestCloseAt > row.latestCloseAt)
    ) {
      row.latestCloseAt = bucket.latestCloseAt
      row.latestListingId = bucket.latestListingId
      row.latestListingAddress = bucket.latestListingAddress
    }
    for (const zipRow of bucket.zips) {
      const zip = normalizeZip(zipRow.zip)
      if (!zip) continue
      row.zips.set(zip, (row.zips.get(zip) ?? 0) + zipRow.count)
    }
  }

  return [...byTown.entries()]
    .map(([town, row]) => ({
      town,
      updateCount: row.count,
      latestUpdate: row.latestCloseAt,
      latestListingId: row.latestListingId,
      latestListingAddress: row.latestListingAddress,
      zips: [...row.zips.entries()]
        .map(([zip, updateCount]) => ({
          zip,
          updateCount,
          latestUpdate: row.latestCloseAt,
        }))
        .sort((a, b) => b.updateCount - a.updateCount),
    }))
    .sort((a, b) => b.updateCount - a.updateCount || a.town.localeCompare(b.town))
}
