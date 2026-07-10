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

function mapOpenHouse(r: RawOpenHouse): OpenHouseEvent | null {
  const date = str(r.OHDate)
  if (!date) return null
  if (str(r.IsDeleted) === '1') return null
  if (str(r.OHActiveYN) !== '1') return null
  if (str(r.OpenHouseStatus).toLowerCase() !== 'active') return null
  const type = str(r.OHType)
  if (type && type.toLowerCase() !== 'public') return null

  const listingKey = str(r.OHListingKey)
  const listingId = str(r.OHListingId)
  if (!listingKey && !listingId) return null

  return {
    id: str(r.OHKey) || str(r.OHID),
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

/** Public active open houses with OHDate in the inclusive ET calendar window. */
export async function fetchUpcomingOpenHouses(
  window = openHouseDateWindow(),
): Promise<OpenHouseEvent[]> {
  const cacheKey = `oh:${window.start}:${window.end}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const dmql = `(OHDate=${window.start}-${window.end}),(OHActiveYN=1),(OpenHouseStatus=Active),(OHType=Public)`

  let records: RawOpenHouse[] = []
  try {
    records = await withRetsClient(async (client) => {
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
    })
  } catch (err) {
    console.error('[open-houses] RETS OpenHouse query failed', err)
    return []
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
