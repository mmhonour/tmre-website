import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  deleteSyncMetaDurable,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'

/**
 * Which towns came back empty-handed on the last finished incremental run.
 *
 * A pull where two towns hit a RETS fault still completes, still upserts the
 * other five, and still stamps `last_incremental_sync`. Everything downstream
 * then reads fresh: the Dashboard row is green, the 70-minute watchdog sees no
 * staleness to heal, and the only visible symptom is a listing somebody happens
 * to notice is missing days later.
 *
 * The End stamp has to keep advancing — the sweep gates on it, and freezing it
 * would re-enqueue a seven-town pull every sixty seconds through an upstream
 * outage. So the incompleteness is recorded here instead, beside it.
 */
export const INCREMENTAL_PARTIAL_KEY = 'last_incremental_partial'

export type IncrementalPartialRun = {
  /** When the partial run finished. */
  at: string
  /** Towns whose pull failed. Empty is never stored — the key is cleared. */
  towns: string[]
}

/** Record (or clear) the towns that failed on a finished run. */
export async function recordIncrementalPartialRun(
  failedTowns: readonly string[],
  finishedAt: string,
): Promise<void> {
  try {
    if (failedTowns.length === 0) {
      await deleteSyncMetaDurable(INCREMENTAL_PARTIAL_KEY)
      return
    }
    const payload: IncrementalPartialRun = {
      at: finishedAt,
      towns: [...new Set(failedTowns)].sort(),
    }
    await setSyncMetaDurable(INCREMENTAL_PARTIAL_KEY, JSON.stringify(payload))
  } catch (err) {
    // Never fail a run over its own bookkeeping.
    console.warn('[incremental] could not record partial-run towns', err)
  }
}

export async function readIncrementalPartialRun(): Promise<IncrementalPartialRun | null> {
  try {
    const raw = await getSyncMetaFresh(INCREMENTAL_PARTIAL_KEY)
    if (!raw?.trim()) return null
    const parsed = JSON.parse(raw) as Partial<IncrementalPartialRun>
    const towns = Array.isArray(parsed.towns)
      ? parsed.towns.filter(
          (town): town is string => typeof town === 'string' && town.length > 0,
        )
      : []
    if (towns.length === 0) return null
    return { at: typeof parsed.at === 'string' ? parsed.at : '', towns }
  } catch {
    return null
  }
}
