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
}

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

/** Today through +6 days in ET — 7 calendar days inclusive. */
export function openHouseDateWindow(from = new Date()): { start: string; end: string } {
  const start = etCalendarDate(from)
  return { start, end: addCalendarDays(start, 6) }
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
