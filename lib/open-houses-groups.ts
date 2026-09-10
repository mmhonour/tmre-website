import {
  addCalendarDays,
  type OpenHouseListing,
} from '@/lib/open-houses'
import {
  TMRE_TOWNS,
  normalizeTownName,
  townForZip,
} from '@/lib/tmre-towns'

export type OpenHouseDayGroup = {
  date: string
  label: string
  listings: OpenHouseListing[]
}

export type OpenHouseTownGroup = {
  town: string
  days: OpenHouseDayGroup[]
}

export function openHouseListingTown(listing: OpenHouseListing): string {
  return (
    townForZip(listing.address.postalCode) ||
    normalizeTownName(listing.address.city) ||
    listing.address.city.trim() ||
    'Other'
  )
}

export function openHouseDayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addCalendarDays(today, 1)) return 'Tomorrow'
  const [y, mo, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1)))
}

/** Town sections, then days that have a showing. Empty days are omitted. */
export function groupOpenHousesByTownAndDay(
  listings: readonly OpenHouseListing[],
  opts: {
    today: string
    byDay?: boolean
    townOrder?: readonly string[]
  },
): OpenHouseTownGroup[] {
  const byDay = opts.byDay !== false
  const townRank = new Map(
    (opts.townOrder ?? TMRE_TOWNS).map((town, i) => [town, i]),
  )
  const byTown = new Map<string, OpenHouseListing[]>()
  for (const listing of listings) {
    const town = openHouseListingTown(listing)
    const list = byTown.get(town) ?? []
    list.push(listing)
    byTown.set(town, list)
  }

  const towns = [...byTown.keys()].sort((a, b) => {
    const left = townRank.get(a) ?? 99
    const right = townRank.get(b) ?? 99
    if (left !== right) return left - right
    return a.localeCompare(b)
  })

  return towns.map((town) => {
    const rows = byTown.get(town) ?? []
    if (!byDay) {
      return { town, days: [{ date: '', label: '', listings: rows }] }
    }
    const byDate = new Map<string, OpenHouseListing[]>()
    for (const listing of rows) {
      const date = listing.nextOpenHouse.date
      const list = byDate.get(date) ?? []
      list.push(listing)
      byDate.set(date, list)
    }
    const days = [...byDate.keys()].sort().map((date) => ({
      date,
      label: openHouseDayLabel(date, opts.today),
      listings: byDate.get(date) ?? [],
    }))
    return { town, days }
  })
}
