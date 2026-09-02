import 'server-only'

import {
  addCalendarDays,
  etCalendarDate,
  isDateInOpenHouseWindow,
  openHouseDateWindow,
  type OpenHouseEvent,
} from '@/lib/open-houses'
import { withRetsClient } from '@/lib/rets'

type RawOpenHouse = Record<string, string>

const OPEN_HOUSE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: OpenHouseEvent[]; expiresAt: number }>()

function str(v: string | undefined): string {
  return (v ?? '').trim()
}

function isRetsNoRecordsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = String((err as { replyCode?: string }).replyCode ?? '')
  const tag = String((err as { replyTag?: string }).replyTag ?? '')
  return code === '20201' || tag === 'NO_RECORDS_FOUND'
}

/** SmartMLS YN fields may return 1 / Y / true. Empty = unknown (don't reject). */
function isTruthyYn(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'y' || s === 'yes' || s === 'true'
}

/** SmartMLS returns LongValue ("Active") or lookup code ("A"). */
function isActiveOpenHouseStatus(v: string): boolean {
  const s = v.trim().toLowerCase()
  return !s || s === 'active' || s === 'a'
}

/** SmartMLS Public = lookup code "O" (Broker tours are "T"). */
function isPublicOpenHouseType(v: string): boolean {
  const s = v.trim().toLowerCase()
  return !s || s === 'public' || s === 'o'
}

function mapOpenHouse(r: RawOpenHouse): OpenHouseEvent | null {
  const date = str(r.OHDate)
  if (!date) return null
  if (str(r.IsDeleted) === '1') return null

  const activeYn = str(r.OHActiveYN)
  if (activeYn && !isTruthyYn(activeYn)) return null
  if (!isActiveOpenHouseStatus(str(r.OpenHouseStatus))) return null
  const type = str(r.OHType)
  if (!isPublicOpenHouseType(type)) return null

  const listingKey = str(r.OHListingKey)
  const listingId = str(r.OHListingId)
  if (!listingKey && !listingId) return null

  return {
    id: str(r.OHKey) || str(r.OHID) || `${listingKey || listingId}:${date}`,
    listingKey,
    listingId,
    date,
    startDateTime: str(r.OHStartDateTime) || null,
    endDateTime: str(r.OHEndDateTime) || null,
    type,
    comment: str(r.OHComment) || null,
  }
}

function sortOpenHouseEvents(events: OpenHouseEvent[]): OpenHouseEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.startDateTime ?? '').localeCompare(b.startDateTime ?? '')
  })
}

/**
 * SmartMLS OpenHouse lookups (probed): OpenHouseStatus A=Active, OHType O=Public.
 * Bare words / wrong codes → NO_RECORDS_FOUND. Fall back to date+ActiveYN and
 * filter Public/Active in {@link mapOpenHouse}.
 */
function openHouseDmqlCandidates(window: {
  start: string
  end: string
}): string[] {
  const date = `(OHDate=${window.start}-${window.end})`
  return [
    `${date},(OHActiveYN=1),(OpenHouseStatus=|A),(OHType=|O)`,
    `${date},(OHActiveYN=1)`,
    date,
  ]
}

async function searchOpenHouse(
  client: {
    search: {
      query: (
        resource: string,
        className: string,
        dmql: string,
        opts: { limit: number; offset: number },
      ) => Promise<{ results?: RawOpenHouse[] }>
    }
  },
  dmql: string,
): Promise<RawOpenHouse[]> {
  try {
    const result = await client.search.query('OpenHouse', 'OpenHouse', dmql, {
      limit: 2500,
      offset: 1,
    })
    return (result?.results ?? []) as RawOpenHouse[]
  } catch (err) {
    if (isRetsNoRecordsError(err)) return []
    throw err
  }
}

/**
 * Public active open houses with OHDate in the inclusive ET calendar window,
 * straight from RETS.
 *
 * Throws on a RETS fault rather than returning an empty list. The sync needs
 * that distinction: "the MLS has no open houses this week" and "the query
 * failed" are the same empty array, and only one of them may be allowed to
 * clear the table.
 */
export async function fetchUpcomingOpenHousesStrict(
  window = openHouseDateWindow(),
): Promise<OpenHouseEvent[]> {
  const records = await withRetsClient(async (client) => {
    for (const dmql of openHouseDmqlCandidates(window)) {
      const rows = await searchOpenHouse(client, dmql)
      if (rows.length > 0) return rows
    }
    return []
  })

  return sortOpenHouseEvents(
    records
      .map(mapOpenHouse)
      .filter((e): e is OpenHouseEvent => e != null)
      .filter((e) => isDateInOpenHouseWindow(e.date, window)),
  )
}

/**
 * Forgiving variant kept for callers that would rather show nothing than fail.
 * Page requests no longer use this — they read Neon.
 */
export async function fetchUpcomingOpenHouses(
  window = openHouseDateWindow(),
): Promise<OpenHouseEvent[]> {
  const cacheKey = `oh:${window.start}:${window.end}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  let records: RawOpenHouse[] = []
  let usedDmql: string | null = null
  try {
    records = await withRetsClient(async (client) => {
      for (const dmql of openHouseDmqlCandidates(window)) {
        const rows = await searchOpenHouse(client, dmql)
        if (rows.length > 0) {
          usedDmql = dmql
          return rows
        }
      }
      return []
    })
  } catch (err) {
    console.error('[open-houses] RETS OpenHouse query failed', err)
    return []
  }

  if (usedDmql) {
    console.info(
      `[open-houses] RETS OpenHouse ok via ${usedDmql} → ${records.length} raw row(s)`,
    )
  } else {
    console.warn(
      `[open-houses] RETS OpenHouse returned 0 rows for ${window.start}–${window.end} (all DMQL variants)`,
    )
  }

  const events = sortOpenHouseEvents(
    records
      .map(mapOpenHouse)
      .filter((e): e is OpenHouseEvent => e != null)
      .filter((e) => isDateInOpenHouseWindow(e.date, window)),
  )

  cache.set(cacheKey, { value: events, expiresAt: Date.now() + OPEN_HOUSE_TTL_MS })
  return events
}

export { addCalendarDays, etCalendarDate, openHouseDateWindow }
