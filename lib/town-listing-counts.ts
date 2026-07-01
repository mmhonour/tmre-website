import {
  listingInTmreCoverage,
  resolveListingTown,
  TMRE_TOWNS,
  townForZip,
  type TmreTown,
} from '@/lib/tmre-towns'

export type TownCountMap = Partial<Record<TmreTown | 'All', number>>

type AddressLike = {
  address: { city: string; postalCode?: string | null }
  city?: string | null
}

export function resolveListingTownKey(
  postalCode: string | null | undefined,
  city: string | null | undefined,
): TmreTown | null {
  return townForZip(postalCode) ?? resolveListingTown(city)
}

/** Count listings per TMRE town (optional zip coverage filter). */
export function countListingsByTown(
  listings: readonly AddressLike[],
  opts?: { requireCoverage?: boolean },
): TownCountMap {
  const counts = Object.fromEntries(TMRE_TOWNS.map((t) => [t, 0])) as Record<TmreTown, number>
  let all = 0

  for (const row of listings) {
    const postal = row.address.postalCode ?? null
    const city = row.city ?? row.address.city
    if (opts?.requireCoverage && !listingInTmreCoverage(postal, city)) continue
    const town = resolveListingTownKey(postal, city)
    if (!town) continue
    counts[town] += 1
    all += 1
  }

  return { ...counts, All: all }
}
