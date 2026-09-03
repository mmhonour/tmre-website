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

export type OpenHouseSyncResult = {
  ok: boolean
  window: { start: string; end: string }
  lookback: { start: string; end: string }
  eventsFetched: number
  written: number
  removed: number
  historyWritten: number
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
 * Pull upcoming + historical open houses from SmartMLS into Neon.
 *
 * Upcoming (today .. +90d) is replaced wholesale so a cancelled showing
 * disappears. History (the prior year) is upserted only — MLS dropping an old
 * row must not erase a count we already stored. Rows older than the lookback
 * horizon are pruned. A RETS fault fails the run instead of emptying a window.
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
      pruned: 0,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const { written, removed } = await replaceOpenHouseWindow(window, upcoming)

  let historyWritten = 0
  if (lookback.start <= lookback.end) {
    try {
      const past = await fetchWindow(lookback, false)
      historyWritten = await upsertOpenHouses(past)
    } catch (err) {
      console.warn(
        '[open-houses-sync] lookback failed (upcoming window already written)',
        err,
      )
    }
  }

  const pruned = await pruneOpenHousesBefore(lookback.start)
  await setSyncMetaDurable(OPEN_HOUSES_SYNCED_AT_KEY, new Date().toISOString())

  return {
    ok: true,
    window,
    lookback,
    eventsFetched: upcoming.length + historyWritten,
    written,
    removed,
    historyWritten,
    pruned,
    durationMs: Date.now() - t0,
  }
}
