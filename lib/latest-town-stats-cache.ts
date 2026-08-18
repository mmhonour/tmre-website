import 'server-only'

import {
  readTownUpdateStats,
  type TownUpdateStat,
} from '@/lib/db/listings-repo'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'

/** Precomputed Latest town + zip 24h update counts. Page reads only. */
export const LATEST_TOWN_STATS_CACHE_KEY = 'latest-town-stats:v1'

export type LatestTownStatsCachePayload = {
  version: 1
  stats: TownUpdateStat[]
  generatedAt: string
}

export async function readLatestTownUpdateStatsCache(): Promise<
  TownUpdateStat[] | null
> {
  const row = await readStatsCacheRow(LATEST_TOWN_STATS_CACHE_KEY)
  if (!row?.payload) return null
  try {
    const parsed = JSON.parse(row.payload) as LatestTownStatsCachePayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.stats)) return null
    return parsed.stats.map((stat) => ({
      ...stat,
      zips: Array.isArray(stat.zips) ? stat.zips : [],
    }))
  } catch {
    return null
  }
}

export async function writeLatestTownUpdateStatsCache(
  stats: TownUpdateStat[],
): Promise<void> {
  const payload: LatestTownStatsCachePayload = {
    version: 1,
    stats,
    generatedAt: new Date().toISOString(),
  }
  await writeStatsCacheRow(LATEST_TOWN_STATS_CACHE_KEY, payload)
}

/** Recompute town + zip 24h update stats into stats_cache. */
export async function rebuildLatestTownUpdateStatsCache(): Promise<{
  written: number
}> {
  const stats = await readTownUpdateStats()
  await writeLatestTownUpdateStatsCache(stats)
  return { written: 1 }
}
