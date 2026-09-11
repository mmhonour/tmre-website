import 'server-only'

import {
  pruneOpenHousesBefore,
  replaceOpenHouseWindow,
  upsertOpenHouses,
} from '@/lib/db/open-houses-repo'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  openHouseHorizonWindow,
  openHouseLookbackWindow,
  splitDateWindow,
  type OpenHouseEvent,
} from '@/lib/open-houses'
import { fetchUpcomingOpenHousesStrict } from '@/lib/open-houses-server'

export const OPEN_HOUSES_SYNCED_AT_KEY = 'open_houses_synced_at'
export const OPEN_HOUSES_LOOKBACK_AT_KEY = 'open_houses_lookback_at'

/** Leave time for alerts after upcoming write; lookback continues next hour. */
export const OPEN_HOUSE_LOOKBACK_BUDGET_MS = 8 * 60 * 1000
export const OPEN_HOUSE_LOOKBACK_CHUNK_DAYS = 14

export type OpenHouseSyncResult = {
  ok: boolean
  window: { start: string; end: string }
  lookback: { start: string; end: string }
  eventsFetched: number
  written: number
  removed: number
  historyWritten: number
  lookbackChunks: number
  lookbackIncomplete: boolean
  pruned: number
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
 * Newest lookback chunks first so recent history lands even when the job
 * budget runs out mid-year. Each chunk upserts on its own; a RETS miss
 * skips that slice instead of aborting the year.
 */
export async function upsertOpenHouseLookbackChunks(
  lookback: { start: string; end: string },
  opts: { budgetMs?: number; nowMs?: number } = {},
): Promise<{ written: number; chunks: number; incomplete: boolean }> {
  if (lookback.start > lookback.end) {
    return { written: 0, chunks: 0, incomplete: false }
  }
  const budgetMs = opts.budgetMs ?? OPEN_HOUSE_LOOKBACK_BUDGET_MS
  const started = opts.nowMs ?? Date.now()
  const chunks = [...splitDateWindow(lookback, OPEN_HOUSE_LOOKBACK_CHUNK_DAYS)].reverse()
  let written = 0
  let done = 0
  for (const chunk of chunks) {
    if (Date.now() - started >= budgetMs) {
      return { written, chunks: done, incomplete: true }
    }
    try {
      const rows = await fetchUpcomingOpenHousesStrict(chunk, { activeOnly: false })
      written += await upsertOpenHouses(uniqueEvents(rows))
      done += 1
    } catch (err) {
      console.warn('[open-houses-sync] lookback chunk failed', chunk, err)
    }
  }
  return { written, chunks: done, incomplete: done < chunks.length }
}

/**
 * Pull upcoming + historical open houses from SmartMLS into Neon.
 *
 * Upcoming (today .. +90d) is replaced wholesale so a cancelled showing
 * disappears, then we stamp `open_houses_synced_at` so a long lookback
 * cannot hide a finished upcoming pull. History is upserted in newest-first
 * slices under a time budget — the next hourly run continues the year.
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
      lookback,
      eventsFetched: 0,
      written: 0,
      removed: 0,
      historyWritten: 0,
      lookbackChunks: 0,
      lookbackIncomplete: false,
      pruned: 0,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const { written, removed } = await replaceOpenHouseWindow(window, upcoming)
  await setSyncMetaDurable(OPEN_HOUSES_SYNCED_AT_KEY, new Date().toISOString())

  let historyWritten = 0
  let lookbackChunks = 0
  let lookbackIncomplete = false
  if (lookback.start <= lookback.end) {
    const lookbackResult = await upsertOpenHouseLookbackChunks(lookback, {
      nowMs: Date.now(),
    })
    historyWritten = lookbackResult.written
    lookbackChunks = lookbackResult.chunks
    lookbackIncomplete = lookbackResult.incomplete
    if (historyWritten > 0 || lookbackChunks > 0) {
      await setSyncMetaDurable(
        OPEN_HOUSES_LOOKBACK_AT_KEY,
        new Date().toISOString(),
      )
    }
  }

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
    lookback,
    eventsFetched: upcoming.length + historyWritten,
    written,
    removed,
    historyWritten,
    lookbackChunks,
    lookbackIncomplete,
    pruned,
    durationMs: Date.now() - t0,
  }
}
