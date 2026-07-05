import 'server-only'

import { getListingsDbStats, getSyncMeta, setSyncMeta } from '@/lib/listings-db'

export function beginSqliteRefresh(): void {
  const depth = Number(getSyncMeta('refresh_depth') ?? '0') + 1
  setSyncMeta('refresh_depth', String(depth))
  if (depth === 1) setSyncMeta('refresh_in_progress', '1')
}

export function endSqliteRefresh(finishedAt?: string): void {
  const current = Number(getSyncMeta('refresh_depth') ?? '0')
  const depth = Math.max(0, current - 1)
  setSyncMeta('refresh_depth', String(depth))
  if (depth === 0) {
    setSyncMeta('refresh_in_progress', '0')
    if (finishedAt) setSyncMeta('last_refresh_finished_at', finishedAt)
  }
}

function latestIsoTimestamp(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null
  let bestMs = -1
  for (const value of values) {
    if (!value) continue
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) continue
    if (ms > bestMs) {
      bestMs = ms
      best = value
    }
  }
  return best
}

export function readSqliteRefreshStatus(): {
  refreshing: boolean
  lastFinishedAt: string | null
} {
  const stats = getListingsDbStats()
  return {
    refreshing: getSyncMeta('refresh_in_progress') === '1',
    lastFinishedAt: latestIsoTimestamp(
      getSyncMeta('last_refresh_finished_at'),
      stats.lastStatsCache,
      stats.lastFullSync,
    ),
  }
}
