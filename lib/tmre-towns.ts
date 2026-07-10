/** TMRE coverage towns — same set as Intelligence / Stats "All Towns" buttons. */
export const TMRE_TOWNS = [
  'Norwalk',
  'New Canaan',
  'Westport',
  'Wilton',
  'Weston',
  'Fairfield',
  'Ridgefield',
] as const

export type TmreTown = (typeof TMRE_TOWNS)[number]

/** Known 5-digit zips within each TMRE town (excludes neighboring towns). */
export const TOWN_ZIPS: Record<TmreTown, readonly string[]> = {
  Norwalk: ['06850', '06851', '06852', '06853', '06854', '06855', '06856'],
  'New Canaan': ['06840'],
  Westport: ['06880', '06881', '06838'],
  Wilton: ['06897'],
  Weston: ['06883'],
  Fairfield: ['06824', '06825', '06828', '06890'],
  Ridgefield: ['06877', '06879'],
}

/** Local area names commonly used alongside the parent town and zip. */
export const ZIP_AREA_NICKNAMES: Readonly<Record<string, string>> = {
  '06853': 'Rowayton',
  '06854': 'South Norwalk',
  '06855': 'Winnipauk',
  '06838': 'Greens Farms',
  '06828': 'Greenfield Hill',
  '06890': 'Southport',
  '06879': 'Branchville',
}

export function zipAreaNickname(postal: string | null | undefined): string | null {
  const zip = normalizeZip(postal)
  return zip ? (ZIP_AREA_NICKNAMES[zip] ?? null) : null
}

/** e.g. Fairfield 06890 · Southport */
export function formatTownZipPlace(town: string, zip: string | null | undefined): string {
  const normalized = normalizeZip(zip)
  if (!normalized) return town
  const nickname = ZIP_AREA_NICKNAMES[normalized]
  return nickname ? `${town} ${normalized} · ${nickname}` : `${town} ${normalized}`
}

/** e.g. Fairfield — 06890 can also be known as Southport — Balanced Fairfield County market */
export function formatTownZipTagline(
  town: string,
  zip: string | null | undefined,
  marketPhrase: string,
): string {
  const normalized = normalizeZip(zip)
  const phrase = marketPhrase.trim()
  const nickname = normalized ? ZIP_AREA_NICKNAMES[normalized] : null
  if (normalized && nickname) {
    return `${town} — ${normalized} can also be known as ${nickname} — ${phrase}`
  }
  if (phrase.toLowerCase().startsWith(town.toLowerCase())) return phrase
  return `${town} — ${phrase}`
}

const ZIP_TO_TOWN = new Map<string, TmreTown>(
  (Object.entries(TOWN_ZIPS) as [TmreTown, readonly string[]][]).flatMap(
    ([town, zips]) => zips.map((zip) => [zip, town]),
  ),
)

/** Union of all zips across TMRE "All Towns" coverage. */
const ALL_TMRE_ZIPS = new Set<string>(
  TMRE_TOWNS.flatMap((town) => TOWN_ZIPS[town]),
)

export function normalizeZip(postal: string | null | undefined): string | null {
  const zip = postal?.trim().slice(0, 5)
  return zip && /^\d{5}$/.test(zip) ? zip : null
}

export function townForZip(postal: string | null | undefined): TmreTown | null {
  const zip = normalizeZip(postal)
  return zip ? (ZIP_TO_TOWN.get(zip) ?? null) : null
}

/** Adjacent TMRE towns (Fairfield County) for map context on Intelligence hover. */
export const TOWN_NEIGHBORS: Record<TmreTown, readonly TmreTown[]> = {
  Norwalk: ['Wilton', 'Westport', 'New Canaan', 'Fairfield'],
  'New Canaan': ['Norwalk', 'Wilton', 'Ridgefield'],
  Westport: ['Norwalk', 'Wilton', 'Weston', 'Fairfield'],
  Wilton: ['Norwalk', 'New Canaan', 'Westport', 'Weston', 'Ridgefield'],
  Weston: ['Wilton', 'Westport', 'Fairfield', 'Ridgefield'],
  Fairfield: ['Norwalk', 'Westport', 'Weston'],
  Ridgefield: ['Wilton', 'Weston', 'New Canaan'],
}

export function neighborTownsFor(town: TmreTown): readonly TmreTown[] {
  return TOWN_NEIGHBORS[town] ?? []
}

export function zipsForNeighborTowns(town: TmreTown): readonly string[] {
  return neighborTownsFor(town).flatMap((t) => TOWN_ZIPS[t])
}

export function zipsForTown(town: TmreTown): readonly string[] {
  return TOWN_ZIPS[town]
}

/** All zips across TMRE coverage (Intelligence “All Towns” map). */
export function zipsForAllTowns(): readonly string[] {
  return [...ALL_TMRE_ZIPS]
}

/** True when a TMRE town spans more than one zip (e.g. Norwalk, Fairfield). */
export function townHasMultipleZips(town: string | null | undefined): boolean {
  const name = normalizeTownName(town)
  if (!name || !isTmreTown(name)) return false
  return TOWN_ZIPS[name as TmreTown].length > 1
}

/** True when postal is missing or matches the town's known zips. */
export function listingZipMatchesTown(
  postal: string | null | undefined,
  town: TmreTown,
): boolean {
  const zip = normalizeZip(postal)
  if (!zip) return true
  return TOWN_ZIPS[town].includes(zip)
}

/** True when zip is in TMRE coverage, or city is a TMRE town when zip is missing. */
export function listingInTmreCoverage(
  postal: string | null | undefined,
  city?: string | null,
): boolean {
  const zip = normalizeZip(postal)
  if (zip) return ALL_TMRE_ZIPS.has(zip)
  return isTmreTown(city)
}

const TMRE_TOWN_SET = new Set(TMRE_TOWNS.map((t) => t.toLowerCase()))

export function normalizeTownName(city: string | null | undefined): string | null {
  if (!city?.trim()) return null
  return city.split(',')[0].trim() || null
}

export function isTmreTown(city: string | null | undefined): city is TmreTown {
  const name = normalizeTownName(city)
  return name != null && TMRE_TOWN_SET.has(name.toLowerCase())
}

/** MLS City field codes for TMRE towns (Fairfield County). */
const MLS_CITY_CODE_TO_TOWN: Record<string, TmreTown> = {
  '350': 'Norwalk',
  '540': 'Westport',
  '550': 'Wilton',
  '530': 'Weston',
  '200': 'Fairfield',
  '310': 'New Canaan',
  '390': 'Ridgefield',
}

/** Resolve a listing's town from MLS city name or numeric city code. */
export function resolveListingTown(city: string | null | undefined): TmreTown | null {
  const raw = city?.trim()
  if (!raw) return null
  if (isTmreTown(raw)) return normalizeTownName(raw) as TmreTown
  if (/^\d+$/.test(raw)) return MLS_CITY_CODE_TO_TOWN[raw] ?? null
  return null
}

/** Resolve town from zip first, then MLS city name or code. */
export function resolveListingTownKey(
  postalCode: string | null | undefined,
  city: string | null | undefined,
): TmreTown | null {
  const zipTown = townForZip(postalCode)
  if (zipTown) return zipTown
  return resolveListingTown(city)
}

export function filterListingsToTmreTowns<T extends { address: { city: string } }>(
  listings: T[],
): T[] {
  return listings.filter((l) => isTmreTown(l.address.city) || resolveListingTown(l.address.city) != null)
}

/** Keep rows that belong to the requested town (zip + city name). */
export function filterListingsForTown<T extends { address: { city: string; postalCode?: string | null } }>(
  listings: T[],
  town: TmreTown,
): T[] {
  return listings.filter((l) => {
    const resolved = resolveListingTown(l.address.city)
    if (resolved && resolved !== town) return false
    return listingZipMatchesTown(l.address.postalCode, town)
  })
}

export function formatTownList(towns: readonly string[]): string {
  if (towns.length === 0) return ''
  if (towns.length === 1) return towns[0]
  if (towns.length === 2) return `${towns[0]} and ${towns[1]}`
  return `${towns.slice(0, -1).join(', ')}, and ${towns[towns.length - 1]}`
}

export const TMRE_TOWNS_LABEL = formatTownList(TMRE_TOWNS)

/** Legacy four-town subset used on homepage, footer, and layout copy. */
export const TMRE_CORE_TOWNS = ['Norwalk', 'Westport', 'Wilton', 'Fairfield'] as const
export const TMRE_CORE_TOWNS_LABEL = formatTownList(TMRE_CORE_TOWNS)

/** Properties page metadata subset. */
export const TMRE_PROPERTIES_TOWNS = ['Norwalk', 'Westport', 'Fairfield'] as const
export const TMRE_PROPERTIES_TOWNS_LABEL = formatTownList(TMRE_PROPERTIES_TOWNS)
