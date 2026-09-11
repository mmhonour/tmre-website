import 'server-only'

import {
  pruneOpenHousesBefore,
  replaceOpenHouseWindow,
  upsertOpenHouses,
} from '@/lib/db/open-houses-repo'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { OPEN_HOUSE_BACKFILL_CHUNK_DAYS } from '@/lib/open-houses-backfill'
import {
  openHouseHorizonWindow,
  openHouseLookbackWindow,
  splitDateWindow,
  type OpenHouseEvent,
} from '@/lib/open-houses'
import { fetchUpcomingOpenHousesStrict } from '@/lib/open-houses-server'

export const OPEN_HOUSES_SYNCED_AT_KEY = 'open_houses_synced_at'
export const OPEN_HOUSES_LOOKBACK_AT_KEY = 'open_houses_lookback_at'

export type OpenHouseSyncResult = {
  ok: boolean
  window: { start: string; end: string }
  eventsFetched: number
  written: number
  removed: number
  pruned: number
  durationMs: number
  error?: string
}

export type OpenHouseLookbackChunkProgress = {
  chunk: { start: string; end: string }
  index: number
  total: number
  fetched: number
  written: number
  error?: string
}

export type OpenHouseHistoryBackfillResult = {
  ok: boolean
  lookback: { start: string; end: string }
  written: number
  chunks: number
  incomplete: boolean
  durationMs: number
  error?: string
}

function uniqueEvents(events: readonly OpenHouseEvent[]): OpenHouseEvent[] {
  const byId = new Map<string, OpenHouseEvent>()
  for (const event of events) byId.set(event.id, event)
  return [...byId.values()]
}

async function fetchWindow(
  window: { start: string; end: string },
  activeOnly: boolean,
): Promise<OpenHouseEvent[]> {
  const chunks = splitDateWindow(window)
  const collected: OpenHouseEvent[] = []
  for (const chunk of chunks) {
    const rows = await fetchUpcomingOpenHousesStrict(chunk, { activeOnly })
    collected.push(...rows)
  }
  return uniqueEvents(collected)
}

/**
 * Upsert historical OpenHouse rows in date chunks. Does not touch the
 * upcoming window. A RETS miss skips that slice instead of aborting.
 *
 * Newest-first by default so recent `pastCount` lands even if the operator
 * stops mid-year. No time budget unless `budgetMs` is set — this is the
 * catalogue pass, not the hourly calendar job.
 */
export async function upsertOpenHouseLookbackChunks(
  lookback: { start: string; end: string },
  opts: {
    budgetMs?: number
    nowMs?: number
    chunkDays?: number
    newestFirst?: boolean
    onChunk?: (progress: OpenHouseLookbackChunkProgress) => void
  } = {},
): Promise<{ written: number; chunks: number; incomplete: boolean }> {
  if (lookback.start > lookback.end) {
    return { written: 0, chunks: 0, incomplete: false }
  }
  const started = opts.nowMs ?? Date.now()
  const chunkDays = opts.chunkDays ?? OPEN_HOUSE_BACKFILL_CHUNK_DAYS
  const newestFirst = opts.newestFirst ?? true
  const forward = splitDateWindow(lookback, chunkDays)
  const chunks = newestFirst ? [...forward].reverse() : forward
  let written = 0
  let done = 0
  for (const [index, chunk] of chunks.entries()) {
    if (opts.budgetMs != null && Date.now() - started >= opts.budgetMs) {
      return { written, chunks: done, incomplete: true }
    }
    try {
      const rows = await fetchUpcomingOpenHousesStrict(chunk, { activeOnly: false })
      const unique = uniqueEvents(rows)
      const chunkWritten = await upsertOpenHouses(unique)
      written += chunkWritten
      done += 1
      opts.onChunk?.({
        chunk,
        index,
        total: chunks.length,
        fetched: unique.length,
        written: chunkWritten,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[open-houses-sync] lookback chunk failed', chunk, err)
      opts.onChunk?.({
        chunk,
        index,
        total: chunks.length,
        fetched: 0,
        written: 0,
        error: message,
      })
    }
  }
  return { written, chunks: done, incomplete: done < chunks.length }
}

/**
 * Hourly calendar job: SmartMLS OpenHouse today → +90d into Neon.
 *
 * Replaces that window so cancellations disappear, stamps
 * `open_houses_synced_at`, prunes rows older than the lookback horizon, then
 * fires due open-house alerts. History is a separate catalogue pass —
 * {@link backfillOpenHouseHistory} / `npm run backfill:open-houses`.
 */
export async function syncOpenHouses(): Promise<OpenHouseSyncResult> {
  const t0 = Date.now()
  const window = openHouseHorizonWindow()
  const lookback = openHouseLookbackWindow()

  let upcoming: OpenHouseEvent[]
  try {
    upcoming = await fetchWindow(window, true)
  } catch (err) {
    return {
      ok: false,
      window,
      eventsFetched: 0,
      written: 0,
      removed: 0,
      pruned: 0,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const { written, removed } = await replaceOpenHouseWindow(window, upcoming)
  await setSyncMetaDurable(OPEN_HOUSES_SYNCED_AT_KEY, new Date().toISOString())

  const pruned = await pruneOpenHousesBefore(lookback.start)

  try {
    const { processDueSavedSearchAlerts } = await import(
      '@/lib/saved-search-alerts'
    )
    await processDueSavedSearchAlerts()
  } catch (err) {
    console.warn('[open-houses-sync] saved-search alerts failed', err)
  }

  return {
    ok: true,
    window,
    eventsFetched: upcoming.length,
    written,
    removed,
    pruned,
    durationMs: Date.now() - t0,
  }
}

/**
 * Catalogue pass: upsert the prior year (or a custom window) of public
 * OpenHouse events. Does not replace the upcoming calendar window.
 */
export async function backfillOpenHouseHistory(
  lookback: { start: string; end: string },
  opts: {
    budgetMs?: number
    chunkDays?: number
    newestFirst?: boolean
    onChunk?: (progress: OpenHouseLookbackChunkProgress) => void
  } = {},
): Promise<OpenHouseHistoryBackfillResult> {
  const t0 = Date.now()
  try {
    const result = await upsertOpenHouseLookbackChunks(lookback, opts)
    if (result.written > 0 || result.chunks > 0) {
      await setSyncMetaDurable(
        OPEN_HOUSES_LOOKBACK_AT_KEY,
        new Date().toISOString(),
      )
    }
    return {
      ok: true,
      lookback,
      written: result.written,
      chunks: result.chunks,
      incomplete: result.incomplete,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    return {
      ok: false,
      lookback,
      written: 0,
      chunks: 0,
      incomplete: true,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
