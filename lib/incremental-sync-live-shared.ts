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

export type IncrementalSyncLiveProgress = {
  phase: 'queued' | 'town' | 'post-hooks'
  town: string | null
  townIndex: number | null
  townCount: number
  updatedAt: string
  /** First time this hop entered `queued` — preserved across cron re-stamps. */
  queuedAt?: string
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
  if (progress.phase === 'queued') {
    if (stale) {
      const mins = Math.max(1, Math.round((ageMs ?? 0) / 60_000))
      return `Queue stale — worker never started (~${mins}m ago). Watchdog/cron should re-queue or lean-fallback; End is still the last finished pull.`
    }
    return 'Queued — waiting for background worker to start town pulls…'
  }
  if (stale) {
    const mins = Math.max(1, Math.round((ageMs ?? 0) / 60_000))
    return `Live status stale (~${mins}m) — worker likely died mid-run. End is still the last finished pull.`
  }
  if (progress.phase === 'post-hooks') {
    return 'Towns done — running post-hooks (board / stats)…'
  }
  if (progress.phase === 'town' && progress.town && progress.townIndex != null) {
    return `Fetching ${progress.town} from MLS… town ${progress.townIndex}/${progress.townCount}`
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
    return {
      phase: parsed.phase,
      town: typeof parsed.town === 'string' ? parsed.town : null,
      townIndex: typeof parsed.townIndex === 'number' ? parsed.townIndex : null,
      townCount: parsed.townCount,
      updatedAt: parsed.updatedAt,
      queuedAt: typeof parsed.queuedAt === 'string' ? parsed.queuedAt : undefined,
    }
  } catch {
    return null
  }
}
