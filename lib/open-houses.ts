/** Shared open-house types and calendar window helpers (client-safe). */

export type OpenHouseEvent = {
  id: string
  listingKey: string
  listingId: string
  date: string
  startDateTime: string | null
  endDateTime: string | null
  type: string
  comment: string | null
}

export type OpenHouseListing = {
  mlsId: string
  listingKey?: string | null
  propertyType: string
  style: string
  address: {
    street: string
    unit: string
    city: string
    state: string
    postalCode: string
    full: string
  }
  price: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  dom: number | null
  photoCount: number | null
  primaryPhotoIndex?: number | null
  status: string
  ownerName: string | null
  openHouses: OpenHouseEvent[]
  nextOpenHouse: OpenHouseEvent
  /** Public events on file with OHDate before today (ET). */
  pastCount: number
  /** Public events on file with OHDate today or later (ET), not only this week. */
  upcomingCount: number
  /** Remaining public OH events in the page display window (ET). */
  weekOpenHouseCount: number
}

export type OpenHousesPageData = {
  listings: OpenHouseListing[]
  generatedAt: string
  source: 'db'
  syncedAt: string | null
  window: { start: string; end: string }
  windowLabel: string
  eventsFound: number
  listingsMatched: number
}

export type OpenHousesPageLoad =
  | { ok: true; data: OpenHousesPageData }
  | { ok: false; error: string; window: { start: string; end: string } }

/** Calendar date (YYYY-MM-DD) in America/New_York. */
export function etCalendarDate(from = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(from)
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, day] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** How far back a sync asks RETS for events the MLS still holds. */
export const OPEN_HOUSE_LOOKBACK_DAYS = 365
/** Inclusive offset: today through today+6 is seven calendar days (t+6). */
export const OPEN_HOUSE_LOOKAHEAD_DAYS = 6

function weekdaySunday0(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Today through today+6 in ET — seven calendar days of inventory. */
export function openHouseDateWindow(from = new Date()): { start: string; end: string } {
  const start = etCalendarDate(from)
  return { start, end: addCalendarDays(start, OPEN_HOUSE_LOOKAHEAD_DAYS) }
}

/** Monday of the calendar week that contains `isoDate` (YYYY-MM-DD). */
export function mondayOfContainingWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const jsSunday0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const mondayOffset = jsSunday0 === 0 ? 6 : jsSunday0 - 1
  return addCalendarDays(isoDate, -mondayOffset)
}

/** Monday–Sunday of the ET week that contains `from` (inclusive). */
export function openHouseWeekWindow(from = new Date()): { start: string; end: string } {
  const start = mondayOfContainingWeek(etCalendarDate(from))
  return { start, end: addCalendarDays(start, 6) }
}

/**
 * What /open-houses lists. ET midnight (12:00 AM America/New_York):
 * Sunday → Sunday through Saturday (the 7-day reset)
 * Monday → Monday through Sunday
 * Tuesday–Saturday → remaining days through Sunday
 */
export function openHouseRemainingWeekWindow(from = new Date()): {
  start: string
  end: string
} {
  const today = etCalendarDate(from)
  if (weekdaySunday0(today) === 0) {
    return openHouseDateWindow(from)
  }
  const week = openHouseWeekWindow(from)
  return { start: today > week.start ? today : week.start, end: week.end }
}

export function openHouseRemainingWeekLabel(window: {
  start: string
  end: string
}): string {
  if (weekdaySunday0(window.start) === 0) {
    return `Sunday through Saturday · ${window.start} through ${window.end} (ET)`
  }
  return `Today through Sunday · ${window.start} through ${window.end} (ET)`
}

export function openHouseInventoryLabel(window: {
  start: string
  end: string
}): string {
  return `Today through +6 days · ${window.start} through ${window.end} (ET)`
}

/** Keep homes that still have a public OH in the page display window. */
export function projectOpenHousesPageToDisplayWindow(
  data: OpenHousesPageData,
  display: { start: string; end: string },
): OpenHousesPageData {
  const listings: OpenHouseListing[] = []
  for (const listing of data.listings) {
    const openHouses = listing.openHouses.filter((event) =>
      isDateInOpenHouseWindow(event.date, display),
    )
    const next = pickNextOpenHouse(openHouses, display.start)
    if (!next) continue
    listings.push({
      ...listing,
      openHouses,
      nextOpenHouse: next,
      weekOpenHouseCount: openHouses.length,
    })
  }
  return {
    ...data,
    listings,
    window: display,
    windowLabel: openHouseRemainingWeekLabel(display),
    eventsFound: listings.reduce((n, listing) => n + listing.openHouses.length, 0),
    listingsMatched: listings.length,
  }
}

/** First event on or after today. Nothing if the series already ended. */
export function pickNextOpenHouse(
  events: readonly OpenHouseEvent[],
  today: string,
): OpenHouseEvent | undefined {
  if (events.length === 0) return undefined
  const sorted = [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (a.startDateTime ?? '').localeCompare(b.startDateTime ?? '')
  })
  return sorted.find((event) => event.date >= today)
}

export const OPEN_HOUSES_LOAD_ERROR_TITLE = 'Open houses could not be loaded'
export const OPEN_HOUSES_LOAD_ERROR_BODY =
  'The week list failed to load. Try again. This is not an empty calendar.'

export const OPEN_HOUSES_PAGE_CACHE_KEY = 'open-houses:remaining-week'

export function openHousesPageCacheMatchesWindow(
  data: Pick<OpenHousesPageData, 'window'> | null | undefined,
  window: { start: string; end: string },
): boolean {
  return (
    data?.window?.start === window.start && data?.window?.end === window.end
  )
}

/** Yesterday back through the lookback horizon (empty when lookback is 0). */
export function openHouseLookbackWindow(from = new Date()): { start: string; end: string } {
  const today = etCalendarDate(from)
  return {
    start: addCalendarDays(today, -OPEN_HOUSE_LOOKBACK_DAYS),
    end: addCalendarDays(today, -1),
  }
}

/** Today through the t+6 inventory horizon — same window the hourly job pulls. */
export function openHouseHorizonWindow(from = new Date()): { start: string; end: string } {
  return openHouseDateWindow(from)
}

/** Split an inclusive date window into chunks so a RETS range stays small. */
export function splitDateWindow(
  window: { start: string; end: string },
  chunkDays = 31,
): { start: string; end: string }[] {
  if (window.start > window.end) return []
  const size = Number.isFinite(chunkDays) && chunkDays > 0 ? Math.floor(chunkDays) : 31
  const chunks: { start: string; end: string }[] = []
  let cursor = window.start
  while (cursor <= window.end) {
    const rawEnd = addCalendarDays(cursor, size - 1)
    const end = rawEnd < window.end ? rawEnd : window.end
    chunks.push({ start: cursor, end })
    cursor = addCalendarDays(end, 1)
  }
  return chunks
}

/** One stored OpenHouse row on a listing History panel. `upcoming` is set upstream. */
export type ListingOpenHouse = OpenHouseEvent & {
  upcoming: boolean
}

export function markOpenHouseUpcoming(
  event: OpenHouseEvent,
  today: string,
): ListingOpenHouse {
  return { ...event, upcoming: event.date >= today }
}

/** SmartMLS OHType `O` is a public open house. */
export function formatOpenHouseType(type: string | null | undefined): string {
  const raw = type?.trim()
  if (!raw || raw === 'O') return 'Public'
  return raw
}

export function formatOpenHouseHistory(past: number, upcoming: number): string {
  const pastLabel = past === 1 ? '1 past' : `${past} past`
  const upcomingLabel = upcoming === 1 ? '1 upcoming' : `${upcoming} upcoming`
  return `${pastLabel} · ${upcomingLabel}`
}

export function formatOpenHouseWeekCount(count: number): string {
  return count === 1 ? '1 this week' : `${count} this week`
}

export function isDateInOpenHouseWindow(
  date: string,
  window: { start: string; end: string },
): boolean {
  return date >= window.start && date <= window.end
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Calendar day from an OHDate string, no timezone shift. */
export function formatOpenHouseDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  if (!y || !mo || !d) return iso
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, mo - 1, d)))
}

/** Corner / compact badge: weekday + times, no month. */
export function formatOpenHouseWhenShort(event: OpenHouseEvent): string {
  const [y, mo, d] = event.date.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, mo - 1, d)))

  const start = event.startDateTime?.includes('T')
    ? event.startDateTime.slice(11, 16)
    : event.startDateTime?.slice(0, 5) ?? null
  const end = event.endDateTime?.includes('T')
    ? event.endDateTime.slice(11, 16)
    : event.endDateTime?.slice(0, 5) ?? null

  if (start && end) return `${weekday} · ${formatTime12(start)}–${formatTime12(end)}`
  if (start) return `${weekday} · ${formatTime12(start)}`
  return weekday
}

/** Human label for an open house slot (naive MLS datetimes treated as ET). */
export function formatOpenHouseWhen(event: OpenHouseEvent): string {
  const [y, mo, d] = event.date.split('-').map(Number)
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, mo - 1, d)))

  const start = event.startDateTime?.includes('T')
    ? event.startDateTime.slice(11, 16)
    : event.startDateTime?.slice(0, 5) ?? null
  const end = event.endDateTime?.includes('T')
    ? event.endDateTime.slice(11, 16)
    : event.endDateTime?.slice(0, 5) ?? null

  if (start && end) return `${dateLabel} · ${formatTime12(start)}–${formatTime12(end)}`
  if (start) return `${dateLabel} · ${formatTime12(start)}`
  return dateLabel
}
