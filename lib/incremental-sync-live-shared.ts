/** Client-safe types + formatters for incremental live Admin Status. */

export const INCREMENTAL_SYNC_LIVE_KEY = 'incremental_sync_live'

export type IncrementalSyncLiveProgress = {
  phase: 'queued' | 'town' | 'post-hooks'
  town: string | null
  townIndex: number | null
  townCount: number
  updatedAt: string
}

export function formatIncrementalSyncLiveStatus(
  progress: IncrementalSyncLiveProgress | null | undefined,
): string | null {
  if (!progress) return null
  if (progress.phase === 'queued') {
    return 'Queued — waiting for background worker to start town pulls…'
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
    }
  } catch {
    return null
  }
}
