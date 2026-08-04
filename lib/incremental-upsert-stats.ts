import 'server-only'

import {
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'

/** Last finished Incremental upsert breakdown (Admin + dumps). */
export const LAST_INCREMENTAL_UPSERT_STATS_KEY = 'last_incremental_upsert_stats'
/** Rolling history of every-30m (and Admin) Incremental upsert counts — ~24h. */
export const INCREMENTAL_UPSERT_HISTORY_KEY = 'incremental_upsert_history'
export const INCREMENTAL_UPSERT_HISTORY_MAX = 48

export type IncrementalTownUpsertStats = {
  town: string
  upserted: number
  inserted: number
  updated: number
  ok: boolean
  durationMs: number
  error?: string
}

export type IncrementalUpsertStats = {
  finishedAt: string
  startedAt: string
  modifiedAfter: string
  durationMs: number
  ok: boolean
  /** inserted + updated */
  upserted: number
  inserted: number
  updated: number
  towns: IncrementalTownUpsertStats[]
}

export type IncrementalUpsertHistory = {
  version: 1
  entries: IncrementalUpsertStats[]
}

export function readLastIncrementalUpsertStats(): IncrementalUpsertStats | null {
  return parseStats(getSyncMeta(LAST_INCREMENTAL_UPSERT_STATS_KEY))
}

/** Prefer Postgres-fresh meta so Dashboard Status sees the just-finished pull. */
export async function readLastIncrementalUpsertStatsFresh(): Promise<IncrementalUpsertStats | null> {
  const fresh = await getSyncMetaFresh(LAST_INCREMENTAL_UPSERT_STATS_KEY)
  return parseStats(fresh) ?? readLastIncrementalUpsertStats()
}

export function readIncrementalUpsertHistory(): IncrementalUpsertStats[] {
  const raw = getSyncMeta(INCREMENTAL_UPSERT_HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as IncrementalUpsertHistory
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return []
    }
    return parsed.entries.filter(
      (e) =>
        e != null &&
        typeof e === 'object' &&
        typeof e.finishedAt === 'string' &&
        typeof e.upserted === 'number' &&
        typeof e.inserted === 'number' &&
        typeof e.updated === 'number',
    )
  } catch {
    return []
  }
}

function parseStats(raw: string | null): IncrementalUpsertStats | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as IncrementalUpsertStats
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.finishedAt !== 'string' ||
      typeof parsed.upserted !== 'number' ||
      typeof parsed.inserted !== 'number' ||
      typeof parsed.updated !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function persistIncrementalUpsertStats(
  stats: IncrementalUpsertStats,
): Promise<void> {
  await setSyncMetaDurable(LAST_INCREMENTAL_UPSERT_STATS_KEY, JSON.stringify(stats))
  const prev = readIncrementalUpsertHistory()
  const entries = [stats, ...prev].slice(0, INCREMENTAL_UPSERT_HISTORY_MAX)
  const history: IncrementalUpsertHistory = { version: 1, entries }
  await setSyncMetaDurable(INCREMENTAL_UPSERT_HISTORY_KEY, JSON.stringify(history))
}

export function formatIncrementalUpsertStats(
  stats: IncrementalUpsertStats | null,
): string | null {
  if (!stats) return null
  return `${stats.upserted} upserts · ${stats.inserted} new · ${stats.updated} updated`
}

/** Pull upsert glance from step-log summary when durable stats meta is missing. */
export function upsertLabelFromStepSummary(
  summary: string | null | undefined,
): string | null {
  const s = summary?.trim()
  if (!s) return null
  const m = s.match(
    /upserts?=(\d+)\s*\((\d+)\s*new,\s*(\d+)\s*updated\)/i,
  )
  if (!m) return null
  return `${m[1]} upserts · ${m[2]} new · ${m[3]} updated`
}
