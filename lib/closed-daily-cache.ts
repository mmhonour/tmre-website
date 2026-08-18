import 'server-only'

import {
  listingZipMatchesTown,
  normalizeZip,
  isTmreTown,
} from '@/lib/tmre-towns'
import { readClosedDailyBuckets } from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import {
  CLOSED_LOOKBACK_MONTHS,
  closedHorizonDays,
  type ClosedDailyCachePayload,
  type ClosedDayBucket,
} from '@/lib/closed-shared'

export const CLOSED_DAILY_CACHE_KEY = 'closed-daily-counts:v1'

export async function readClosedDailyCache(): Promise<ClosedDailyCachePayload | null> {
  const row = await readStatsCacheRow(CLOSED_DAILY_CACHE_KEY)
  if (!row?.payload) return null
  try {
    const parsed = JSON.parse(row.payload) as ClosedDailyCachePayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.buckets)) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeClosedDailyCache(
  payload: ClosedDailyCachePayload,
): Promise<void> {
  await writeStatsCacheRow(CLOSED_DAILY_CACHE_KEY, payload)
}

function foldDailyRows(
  rows: Awaited<ReturnType<typeof readClosedDailyBuckets>>,
): ClosedDayBucket[] {
  const byKey = new Map<string, ClosedDayBucket>()
  for (const row of rows) {
    if (!isTmreTown(row.town)) continue
    const key = `${row.town}|${row.day}`
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = {
        town: row.town,
        day: row.day,
        count: row.count,
        latestListingId: row.latestListingId,
        latestListingAddress: row.latestListingAddress,
        latestCloseAt: row.latestCloseAt,
        zips: [],
      }
      byKey.set(key, bucket)
    }
    const zip = normalizeZip(row.zip)
    if (!zip || !listingZipMatchesTown(zip, row.town)) continue
    const existing = bucket.zips.find((z) => z.zip === zip)
    if (existing) existing.count += row.zipCount
    else bucket.zips.push({ zip, count: row.zipCount })
  }
  for (const bucket of byKey.values()) {
    bucket.zips.sort((a, b) => b.count - a.count)
  }
  return [...byKey.values()].sort((a, b) =>
    a.town === b.town ? a.day.localeCompare(b.day) : a.town.localeCompare(b.town),
  )
}

/** Recompute daily closed counts into stats_cache. Page range-sums only. */
export async function rebuildClosedDailyCache(): Promise<{ written: number }> {
  const rows = await readClosedDailyBuckets({ months: CLOSED_LOOKBACK_MONTHS })
  const days = closedHorizonDays()
  const payload: ClosedDailyCachePayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    horizonStart: days[0] ?? '',
    horizonEnd: days[days.length - 1] ?? '',
    buckets: foldDailyRows(rows),
  }
  await writeClosedDailyCache(payload)
  return { written: 1 }
}
