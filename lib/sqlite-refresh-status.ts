import 'server-only'

import { getListingsDbStats, getSyncMeta, setSyncMeta } from '@/lib/listings-db'
import {
  SqliteWriteStatsCollector,
  getActiveRefreshLockStats,
  setActiveRefreshLockStats,
  type TableWriteStats,
} from '@/lib/sqlite-sync-stats'

import { isServerlessRuntime } from '@/lib/runtime-host'

const MAX_REFRESH_MS_LONG_LIVED = 2 * 60 * 60 * 1000
/** Next/Lambda serverless cannot hold a refresh for hours — heal leaked locks sooner. */
const MAX_REFRESH_MS_SERVERLESS = 8 * 60 * 1000

function maxRefreshMs(): number {
  return isServerlessRuntime() ? MAX_REFRESH_MS_SERVERLESS : MAX_REFRESH_MS_LONG_LIVED
}
const REFRESH_LOCK_HISTORY_KEY = 'refresh_lock_history'
const REFRESH_LOCK_HISTORY_WINDOW_MS = 48 * 60 * 60 * 1000
const MAX_REFRESH_LOCK_HISTORY_ENTRIES = 200

export type SqliteRefreshLockStatus = {
  inProgress: boolean
  depth: number
  startedAt: string | null
  finishedAt: string | null
  stuck: boolean
  stuckReason: string | null
}

export type RefreshLockHistoryEntry = {
  id: string
  source: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  tables: string[]
  tableStats: TableWriteStats[]
  clearedManually?: boolean
}

export type RefreshLockHistorySummary = {
  windowMs: number
  lockCount: number
  activeCount: number
  completedCount: number
  totalHeldMs: number
  entries: RefreshLockHistoryEntry[]
  allTables: string[]
}

let activeHistoryEntryId: string | null = null

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

function newHistoryEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function readRefreshLockHistoryRaw(): RefreshLockHistoryEntry[] {
  const raw = getSyncMeta(REFRESH_LOCK_HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is RefreshLockHistoryEntry =>
        entry != null &&
        typeof entry === 'object' &&
        typeof (entry as RefreshLockHistoryEntry).id === 'string' &&
        typeof (entry as RefreshLockHistoryEntry).startedAt === 'string' &&
        Array.isArray((entry as RefreshLockHistoryEntry).tables),
    )
  } catch {
    return []
  }
}

function writeRefreshLockHistory(entries: RefreshLockHistoryEntry[]): void {
  setSyncMeta(REFRESH_LOCK_HISTORY_KEY, JSON.stringify(entries))
}

function pruneRefreshLockHistory(
  entries: RefreshLockHistoryEntry[],
  now = Date.now(),
): RefreshLockHistoryEntry[] {
  const cutoff = now - REFRESH_LOCK_HISTORY_WINDOW_MS
  return entries
    .filter((entry) => {
      const startedMs = parseIsoMs(entry.startedAt)
      return startedMs != null && startedMs >= cutoff
    })
    .slice(-MAX_REFRESH_LOCK_HISTORY_ENTRIES)
}

function finalizeActiveHistoryEntry(
  finishedAt: string,
  options: { clearedManually?: boolean } = {},
): void {
  if (!activeHistoryEntryId) return

  const entries = pruneRefreshLockHistory(readRefreshLockHistoryRaw())
  const idx = entries.findIndex((entry) => entry.id === activeHistoryEntryId)
  if (idx < 0) return

  const startedMs = parseIsoMs(entries[idx].startedAt)
  const finishedMs = parseIsoMs(finishedAt)
  const tableStats =
    getActiveRefreshLockStats()?.snapshot() ?? entries[idx].tableStats ?? []
  const tables =
    tableStats.length > 0
      ? tableStats.map((row) => row.table)
      : getActiveRefreshLockStats()?.touchedTables() ?? entries[idx].tables

  entries[idx] = {
    ...entries[idx],
    finishedAt,
    durationMs:
      startedMs != null && finishedMs != null ? Math.max(0, finishedMs - startedMs) : null,
    tables,
    tableStats,
    ...(options.clearedManually ? { clearedManually: true } : {}),
  }
  writeRefreshLockHistory(entries)
}

function startRefreshLockHistoryEntry(source: string | null): void {
  const entry: RefreshLockHistoryEntry = {
    id: newHistoryEntryId(),
    source,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    tables: [],
    tableStats: [],
  }
  activeHistoryEntryId = entry.id
  const entries = pruneRefreshLockHistory([...readRefreshLockHistoryRaw(), entry])
  writeRefreshLockHistory(entries)
}

/** Active collector for tables written while the outermost refresh lock is held. */
export function getRefreshLockStatsCollector(): SqliteWriteStatsCollector | null {
  return getActiveRefreshLockStats()
}

export function readRefreshLockHistorySummary(now = Date.now()): RefreshLockHistorySummary {
  const entries = pruneRefreshLockHistory(readRefreshLockHistoryRaw(), now)
  let totalHeldMs = 0
  let activeCount = 0
  let completedCount = 0
  const allTables = new Set<string>()

  for (const entry of entries) {
    for (const table of entry.tables) allTables.add(table)
    if (entry.finishedAt == null) {
      activeCount += 1
      const startedMs = parseIsoMs(entry.startedAt)
      if (startedMs != null) totalHeldMs += Math.max(0, now - startedMs)
    } else {
      completedCount += 1
      if (entry.durationMs != null) totalHeldMs += entry.durationMs
      else {
        const startedMs = parseIsoMs(entry.startedAt)
        const finishedMs = parseIsoMs(entry.finishedAt)
        if (startedMs != null && finishedMs != null) {
          totalHeldMs += Math.max(0, finishedMs - startedMs)
        }
      }
    }
  }

  return {
    windowMs: REFRESH_LOCK_HISTORY_WINDOW_MS,
    lockCount: entries.length,
    activeCount,
    completedCount,
    totalHeldMs,
    entries: entries.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    allTables: [...allTables].sort((a, b) => a.localeCompare(b)),
  }
}

/** Read refresh lock metadata without auto-healing. */
export function readSqliteRefreshLockStatus(now = Date.now()): SqliteRefreshLockStatus {
  const inProgress = getSyncMeta('refresh_in_progress') === '1'
  const depth = Number(getSyncMeta('refresh_depth') ?? '0')
  const startedAt = getSyncMeta('last_refresh_started_at') ?? null
  const finishedAt = getSyncMeta('last_refresh_finished_at') ?? null

  let stuckReason: string | null = null

  if (inProgress && depth <= 0) {
    stuckReason = 'Refresh flag is set but depth is zero (likely a leaked lock)'
  } else if (!inProgress && depth > 0) {
    stuckReason = 'Refresh depth is non-zero but the in-progress flag is clear'
  } else if (inProgress && !startedAt && finishedAt) {
    stuckReason = 'Legacy leaked lock (no start timestamp recorded)'
  } else if (inProgress && startedAt && finishedAt) {
    const startedMs = parseIsoMs(startedAt)
    const finishedMs = parseIsoMs(finishedAt)
    if (startedMs != null && finishedMs != null && finishedMs >= startedMs) {
      stuckReason = 'Last refresh finished but the lock was not cleared'
    }
  }

  if (!stuckReason && inProgress && startedAt) {
    const startedMs = parseIsoMs(startedAt)
    const maxMs = maxRefreshMs()
    if (startedMs != null && now - startedMs > maxMs) {
      stuckReason = `Refresh started more than ${Math.round(maxMs / 60_000)} minutes ago`
    }
  }

  if (!stuckReason && inProgress && !startedAt && !finishedAt) {
    stuckReason = 'Refresh lock held with no timestamps (common after dev hot reload)'
  }

  const stuck = stuckReason != null

  return {
    inProgress,
    depth,
    startedAt,
    finishedAt,
    stuck,
    stuckReason,
  }
}

/** Force-clear refresh lock metadata (admin action). Returns prior state. */
export function forceClearSqliteRefreshLock(): SqliteRefreshLockStatus {
  const before = readSqliteRefreshLockStatus()
  if (before.inProgress || before.depth > 0) {
    finalizeActiveHistoryEntry(new Date().toISOString(), { clearedManually: true })
  }
  setActiveRefreshLockStats(null)
  activeHistoryEntryId = null
  setSyncMeta('refresh_depth', '0')
  setSyncMeta('refresh_in_progress', '0')
  return before
}

export function beginSqliteRefresh(source: string | null = null): void {
  const depth = Number(getSyncMeta('refresh_depth') ?? '0') + 1
  setSyncMeta('refresh_depth', String(depth))
  if (depth === 1) {
    setActiveRefreshLockStats(new SqliteWriteStatsCollector())
    startRefreshLockHistoryEntry(source)
    setSyncMeta('refresh_in_progress', '1')
    setSyncMeta('last_refresh_started_at', new Date().toISOString())
  }
}

export function endSqliteRefresh(finishedAt?: string): void {
  const current = Number(getSyncMeta('refresh_depth') ?? '0')
  const depth = Math.max(0, current - 1)
  setSyncMeta('refresh_depth', String(depth))
  if (depth === 0) {
    const finished = finishedAt ?? new Date().toISOString()
    finalizeActiveHistoryEntry(finished)
    setActiveRefreshLockStats(null)
    activeHistoryEntryId = null
    setSyncMeta('refresh_in_progress', '0')
    if (finishedAt) setSyncMeta('last_refresh_finished_at', finishedAt)
  }
}

/** Clear a leaked refresh lock (e.g. dev HMR mid-sync). Returns true when healed. */
export function healStaleRefreshLock(now = Date.now()): boolean {
  if (getSyncMeta('refresh_in_progress') !== '1') return false

  const depth = Number(getSyncMeta('refresh_depth') ?? '0')
  if (depth <= 0) {
    if (activeHistoryEntryId) {
      finalizeActiveHistoryEntry(new Date(now).toISOString(), { clearedManually: true })
    }
    setActiveRefreshLockStats(null)
    activeHistoryEntryId = null
    setSyncMeta('refresh_in_progress', '0')
    return true
  }

  const started = getSyncMeta('last_refresh_started_at')
  if (started) {
    const startedMs = Date.parse(started)
    const limitMs = maxRefreshMs()
    if (!Number.isNaN(startedMs) && now - startedMs > limitMs) {
      finalizeActiveHistoryEntry(new Date(now).toISOString(), { clearedManually: true })
      setActiveRefreshLockStats(null)
      activeHistoryEntryId = null
      setSyncMeta('refresh_depth', '0')
      setSyncMeta('refresh_in_progress', '0')
      return true
    }
    return false
  }

  // Legacy stuck lock from before last_refresh_started_at was tracked.
  const finished = getSyncMeta('last_refresh_finished_at')
  if (finished) {
    if (activeHistoryEntryId) {
      finalizeActiveHistoryEntry(new Date(now).toISOString(), { clearedManually: true })
    }
    setActiveRefreshLockStats(null)
    activeHistoryEntryId = null
    setSyncMeta('refresh_depth', '0')
    setSyncMeta('refresh_in_progress', '0')
    return true
  }

  return false
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
  healStaleRefreshLock()
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
