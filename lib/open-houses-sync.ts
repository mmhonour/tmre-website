import 'server-only'

import {
  pruneOpenHousesBefore,
  replaceOpenHouseWindow,
} from '@/lib/db/open-houses-repo'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  fetchUpcomingOpenHousesStrict,
  openHouseDateWindow,
} from '@/lib/open-houses-server'

export const OPEN_HOUSES_SYNCED_AT_KEY = 'open_houses_synced_at'

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

/**
 * Pull the rolling open-house window from SmartMLS into Neon.
 *
 * The one rule that matters: an empty result is only allowed to empty the table
 * when the pull genuinely succeeded and the MLS genuinely has no open houses.
 * A RETS fault must fail the run instead, because the alternative — a query
 * error quietly wiping the weekend's open houses off the site — looks exactly
 * like a quiet Sunday.
 */
export async function syncOpenHouses(): Promise<OpenHouseSyncResult> {
  const t0 = Date.now()
  const window = openHouseDateWindow()

  let events
  try {
    events = await fetchUpcomingOpenHousesStrict(window)
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

  const { written, removed } = await replaceOpenHouseWindow(window, events)
  const pruned = await pruneOpenHousesBefore(window.start)
  await setSyncMetaDurable(OPEN_HOUSES_SYNCED_AT_KEY, new Date().toISOString())

  return {
    ok: true,
    window,
    eventsFetched: events.length,
    written,
    removed,
    pruned,
    durationMs: Date.now() - t0,
  }
}
