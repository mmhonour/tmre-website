/** Client-safe types + formatters for incremental live Admin Status. */

export const INCREMENTAL_SYNC_LIVE_KEY = 'incremental_sync_live'

/**
 * Live "town / post-hooks" breadcrumbs older than this are treated as dead —
 * the worker crashed without clearing the key.
 * Aligns with the ~15m Netlify worker budget + a small grace window.
 */
export const INCREMENTAL_SYNC_LIVE_STALE_MS = 20 * 60 * 1000

/**
 * Queued-only breadcrumbs go stale faster. Cron used to re-stamp `updatedAt`
 * every 30m on a successful 202, which reset the 20m clock forever and blocked
 * the watchdog. Age is measured from first queue (`queuedAt` / original stamp).
 */
export const INCREMENTAL_SYNC_QUEUED_STALE_MS = 8 * 60 * 1000

export type IncrementalLiveStatusScope = 'all' | 'active' | 'closed'

export type IncrementalSyncLiveProgress = {
  phase: 'queued' | 'town' | 'post-hooks'
  town: string | null
  townIndex: number | null
  townCount: number
  updatedAt: string
  /** First time this hop entered `queued` — preserved across cron re-stamps. */
  queuedAt?: string
  /**
   * Towns this run will pull (empty / omit = all TMRE towns).
   * Set at queue so Status can describe scope before the worker starts, and so
   * the worker can recover scope if the POST body drops `towns`.
   */
  scopeTowns?: string[]
  /** Status family for this run (omit / all = Active family + Closed). */
  statusScope?: IncrementalLiveStatusScope
}

function statusScopeLabel(
  scope: IncrementalLiveStatusScope | undefined,
): string | null {
  if (!scope || scope === 'all') return null
  if (scope === 'active') return 'Active family'
  return 'Closed only'
}

function scopeTownsLabel(
  progress: IncrementalSyncLiveProgress,
): string | null {
  const towns = progress.scopeTowns?.filter(Boolean) ?? []
  if (towns.length === 1) return towns[0]!
  if (towns.length > 1 && towns.length < progress.townCount) {
    return `${towns.length} towns`
  }
  if (progress.townCount === 1 && progress.town) return progress.town
  return null
}

export function incrementalSyncLiveAgeMs(
  progress: IncrementalSyncLiveProgress | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!progress) return null
  // For queued, prefer first-queue time so re-stamps cannot reset stale detection.
  const iso =
    progress.phase === 'queued'
      ? progress.queuedAt || progress.updatedAt
      : progress.updatedAt
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return Math.max(0, nowMs - ms)
}

export function incrementalSyncLiveStaleMs(
  progress: IncrementalSyncLiveProgress | null | undefined,
): number {
  if (progress?.phase === 'queued') return INCREMENTAL_SYNC_QUEUED_STALE_MS
  return INCREMENTAL_SYNC_LIVE_STALE_MS
}

export function isIncrementalSyncLiveStale(
  progress: IncrementalSyncLiveProgress | null | undefined,
  nowMs = Date.now(),
): boolean {
  const age = incrementalSyncLiveAgeMs(progress, nowMs)
  if (age == null) return false
  return age > incrementalSyncLiveStaleMs(progress)
}

/** True when live says Queued and the hop is older than the dead-queue window. */
export function isIncrementalSyncQueuedDead(
  progress: IncrementalSyncLiveProgress | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!progress || progress.phase !== 'queued') return false
  return isIncrementalSyncLiveStale(progress, nowMs)
}

export function formatIncrementalSyncLiveStatus(
  progress: IncrementalSyncLiveProgress | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!progress) return null
  const ageMs = incrementalSyncLiveAgeMs(progress, nowMs)
  const stale = isIncrementalSyncLiveStale(progress, nowMs)
  const statusBit = statusScopeLabel(progress.statusScope)
  const townsBit = scopeTownsLabel(progress)
  const scopeSuffix = [townsBit, statusBit].filter(Boolean).join(' · ')

  if (progress.phase === 'queued') {
    if (stale) {
      const mins = Math.max(1, Math.round((ageMs ?? 0) / 60_000))
      return `Queue stale — worker never started (~${mins}m ago). End is still the last finished pull.`
    }
    return scopeSuffix
      ? `Queued — ${scopeSuffix} (waiting for worker)…`
      : 'Queued — all towns (waiting for worker)…'
  }
  if (stale) {
    const mins = Math.max(1, Math.round((ageMs ?? 0) / 60_000))
    return `Live status stale (~${mins}m) — worker likely died mid-run. End is still the last finished pull.`
  }
  if (progress.phase === 'post-hooks') {
    return scopeSuffix
      ? `Towns done (${scopeSuffix}) — post-hooks (board / stats)…`
      : 'Towns done — post-hooks (board / stats)…'
  }
  if (progress.phase === 'town' && progress.town && progress.townIndex != null) {
    const statusParen = statusBit ? ` · ${statusBit}` : ''
    if (progress.townCount <= 1) {
      return `Fetching ${progress.town} from MLS${statusParen}…`
    }
    return `Fetching ${progress.town} from MLS (${progress.townIndex}/${progress.townCount})${statusParen}…`
  }
  return null
}

export function parseIncrementalSyncLive(
  raw: string | null | undefined,
): IncrementalSyncLiveProgress | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<IncrementalSyncLiveProgress>
    if (
      parsed == null ||
      typeof parsed !== 'object' ||
      (parsed.phase !== 'queued' &&
        parsed.phase !== 'town' &&
        parsed.phase !== 'post-hooks') ||
      typeof parsed.townCount !== 'number' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null
    }
    const scopeTowns = Array.isArray(parsed.scopeTowns)
      ? parsed.scopeTowns.filter(
          (t): t is string => typeof t === 'string' && t.trim().length > 0,
        )
      : undefined
    const statusScope =
      parsed.statusScope === 'active' ||
      parsed.statusScope === 'closed' ||
      parsed.statusScope === 'all'
        ? parsed.statusScope
        : undefined
    return {
      phase: parsed.phase,
      town: typeof parsed.town === 'string' ? parsed.town : null,
      townIndex: typeof parsed.townIndex === 'number' ? parsed.townIndex : null,
      townCount: parsed.townCount,
      updatedAt: parsed.updatedAt,
      queuedAt: typeof parsed.queuedAt === 'string' ? parsed.queuedAt : undefined,
      ...(scopeTowns && scopeTowns.length > 0 ? { scopeTowns } : {}),
      ...(statusScope ? { statusScope } : {}),
    }
  } catch {
    return null
  }
}
