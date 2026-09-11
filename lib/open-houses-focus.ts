/** Top N historical hosts in each town; ties at the cutoff stay in. */
export const OPEN_HOUSE_MOST_TOP_N = 3

export type OpenHouseFocusFlags = {
  most: boolean
  first: boolean
}

export type OpenHouseFocusListing = {
  pastCount?: number | null
  weekOpenHouseCount?: number | null
}

export function historicalShowingCount(listing: OpenHouseFocusListing): number {
  return listing.pastCount ?? 0
}

/** No public open house on file before today (ET). */
export function isFirstOpenHouse(listing: OpenHouseFocusListing): boolean {
  return historicalShowingCount(listing) === 0
}

/**
 * Cutoff past-count for “top N homes, plus ties.” Homes with 0 past never
 * qualify. `null` means the pool has no history.
 */
export function mostHistoricalCutoff(
  pastCounts: readonly number[],
  topN = OPEN_HOUSE_MOST_TOP_N,
): number | null {
  const ranked = pastCounts
    .filter((count) => count > 0)
    .sort((a, b) => b - a)
  if (ranked.length === 0) return null
  return ranked[Math.min(topN, ranked.length) - 1] ?? null
}

export function listingsWithMostHistoricalShowings<T extends OpenHouseFocusListing>(
  listings: readonly T[],
  topN = OPEN_HOUSE_MOST_TOP_N,
): T[] {
  const cutoff = mostHistoricalCutoff(
    listings.map(historicalShowingCount),
    topN,
  )
  if (cutoff == null) return []
  return listings.filter((listing) => historicalShowingCount(listing) >= cutoff)
}

export function listingMatchesOpenHouseFocus(
  listing: OpenHouseFocusListing,
  focus: OpenHouseFocusFlags,
  townPool: readonly OpenHouseFocusListing[] = [listing],
): boolean {
  if (focus.most) {
    const cutoff = mostHistoricalCutoff(townPool.map(historicalShowingCount))
    if (cutoff == null || historicalShowingCount(listing) < cutoff) return false
  }
  if (focus.first && !isFirstOpenHouse(listing)) return false
  return true
}

/** Most and First are a single choice — turning one on clears the other. */
export function exclusiveOpenHouseFocus(
  key: keyof OpenHouseFocusFlags,
  on: boolean,
): OpenHouseFocusFlags {
  if (!on) return { most: false, first: false }
  return key === "most"
    ? { most: true, first: false }
    : { most: false, first: true }
}

/**
 * Most = top 3 historical showing counts per town (ties at #3 stay).
 * First = zero past showings. The page treats them as exclusive; if both
 * flags arrive, the intersection is empty by definition.
 */
export function filterOpenHouseFocus<T extends OpenHouseFocusListing>(
  listings: readonly T[],
  focus: OpenHouseFocusFlags,
  townOf?: (listing: T) => string,
): T[] {
  let result = [...listings]
  if (focus.most) {
    const keyOf = townOf ?? (() => '_')
    const byTown = new Map<string, T[]>()
    for (const listing of result) {
      const town = keyOf(listing)
      const group = byTown.get(town) ?? []
      group.push(listing)
      byTown.set(town, group)
    }
    result = [...byTown.values()].flatMap((group) =>
      listingsWithMostHistoricalShowings(group),
    )
  }
  if (focus.first) result = result.filter(isFirstOpenHouse)
  return result
}

export function compareOpenHousePastCountDesc(
  a: OpenHouseFocusListing,
  b: OpenHouseFocusListing,
): number {
  return historicalShowingCount(b) - historicalShowingCount(a)
}

export function openHouseFocusEmptyCopy(opts: {
  focus: OpenHouseFocusFlags
  town?: string | null
}): string {
  const place = opts.town ? ` in ${opts.town}` : ''
  if (opts.focus.most && opts.focus.first) {
    return `No home can be both a first showing and a top historical host${place}.`
  }
  if (opts.focus.most) {
    return `No stored past showings${place} — Most open houses needs history on file.`
  }
  if (opts.focus.first) {
    return `No first-time open houses this week${place} — every home here already has a prior showing in our history.`
  }
  return `No public open houses scheduled today through Sunday${place}.`
}
