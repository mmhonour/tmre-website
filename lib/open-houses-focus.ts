/** Homes with at least this many public OH slots this Monday–Sunday week. */
export const OPEN_HOUSE_MOST_MIN_WEEK = 2

export type OpenHouseFocusFlags = {
  most: boolean
  first: boolean
}

export type OpenHouseFocusListing = {
  pastCount?: number | null
  weekOpenHouseCount?: number | null
}

/** No public open house on file before today (ET). */
export function isFirstOpenHouse(listing: OpenHouseFocusListing): boolean {
  return (listing.pastCount ?? 0) === 0
}

/** Multiple public open houses this week — the busy hosts. */
export function isMostOpenHouses(listing: OpenHouseFocusListing): boolean {
  return (listing.weekOpenHouseCount ?? 0) >= OPEN_HOUSE_MOST_MIN_WEEK
}

export function listingMatchesOpenHouseFocus(
  listing: OpenHouseFocusListing,
  focus: OpenHouseFocusFlags,
): boolean {
  if (focus.most && !isMostOpenHouses(listing)) return false
  if (focus.first && !isFirstOpenHouse(listing)) return false
  return true
}

export function filterOpenHouseFocus<T extends OpenHouseFocusListing>(
  listings: readonly T[],
  focus: OpenHouseFocusFlags,
): T[] {
  if (!focus.most && !focus.first) return [...listings]
  return listings.filter((listing) => listingMatchesOpenHouseFocus(listing, focus))
}

export function compareOpenHouseWeekCountDesc(
  a: OpenHouseFocusListing,
  b: OpenHouseFocusListing,
): number {
  return (b.weekOpenHouseCount ?? 0) - (a.weekOpenHouseCount ?? 0)
}

export function openHouseFocusEmptyCopy(opts: {
  focus: OpenHouseFocusFlags
  town?: string | null
}): string {
  const place = opts.town ? ` in ${opts.town}` : ''
  if (opts.focus.most && opts.focus.first) {
    return `No first-time homes with two or more public open houses this week${place}.`
  }
  if (opts.focus.most) {
    return `No home has more than one public open house this week${place}.`
  }
  if (opts.focus.first) {
    return `No first-time open houses this week${place} — every home here already has a prior showing in our history.`
  }
  return `No public open houses scheduled this Monday–Sunday week${place}.`
}
