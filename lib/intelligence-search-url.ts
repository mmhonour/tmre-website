import { isRentalListing } from '@/lib/listing-kind'
import { matchesNewConstruction } from '@/lib/new-construction'
import { normalizeTownName, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type IntelligenceSearchFromListing = {
  propertyType: string
  style?: string | null
  beds: number | null
  baths: number | null
  yearBuilt?: number | null
  address: {
    city: string
    postalCode?: string | null
  }
  raw?: Record<string, string>
}

function isCommercialType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType)
}

function inferSaleProperty(
  propertyType: string,
  style?: string | null,
): 'homes' | 'multi' | 'condos' {
  const hay = `${propertyType} ${style ?? ''}`
  if (/condo|co-op/i.test(hay)) return 'condos'
  if (/multi|duplex|triplex|fourplex|2-family|3-family|4-family/i.test(hay)) {
    return 'multi'
  }
  return 'homes'
}

function clampFilterCount(n: number): number {
  return Math.min(6, Math.max(1, Math.floor(n)))
}

/** Build /intelligence URL preloaded for this listing's bed/bath, town, zip, and type. */
export function intelligenceSearchHrefFromListing(
  listing: IntelligenceSearchFromListing,
): string | null {
  if (listing.beds == null || listing.baths == null) return null
  if (listing.beds <= 0 || listing.baths <= 0) return null

  const town = normalizeTownName(listing.address.city)
  if (!town || !(TMRE_TOWNS as readonly string[]).includes(town)) return null

  const rental = isRentalListing(listing)
  const commercial = isCommercialType(listing.propertyType ?? '')
  const newConstruction = matchesNewConstruction(
    listing.yearBuilt,
    listing.propertyType,
  )

  return buildIntelligenceShareHref({
    city: town,
    zip: listing.address.postalCode?.trim() || null,
    bedsMin: clampFilterCount(listing.beds),
    bedsMax: clampFilterCount(listing.beds),
    bathsMin: clampFilterCount(listing.baths),
    bathsMax: 6,
    tx: rental ? 'rental' : 'sale',
    cls: commercial ? 'commercial' : 'residential',
    property: commercial || rental
      ? 'all'
      : inferSaleProperty(listing.propertyType, listing.style),
    newConstruction,
  })
}

export type ParsedIntelligenceSearch = {
  city: TmreTown | 'All'
  zip: string | null
  bedsMin: number | null
  bedsMax: number | null
  bathsMin: number | null
  bathsMax: number | null
  vintageMin: number | null
  vintageMax: number | null
  tx: 'all' | 'sale' | 'rental' | null
  cls: 'all' | 'residential' | 'commercial' | null
  property: 'all' | 'homes' | 'multi' | 'condos' | null
  /** true = New, false = Not New, null = any */
  newConstruction: boolean | null
  exactBeds: boolean
  status: 'all' | 'new' | 'reduced' | 'active' | null
  sort: string | null
  dir: 'asc' | 'desc' | null
  view: 'large' | 'grid' | 'line' | 'map' | null
  /** Map is a layer; not exclusive of Large / Grid / Line. */
  mapOn: boolean
  /** Desktop map arrangement when the map layer is on. */
  mapLayout: 'top' | 'side' | null
  furnished: string | null
  /** Include plain "Under Contract" rows (Continue to Show always shows). */
  underContract: boolean
  minPrice: number | null
  maxPrice: number | null
  minSqft: number | null
  maxSqft: number | null
  /** Days-on-market band id from the DOM mini chart (`{tierId}:{min}-{max}`). */
  domBand: string | null
  /** Clear cookie/memory minor filters not defined in the URL. */
  resetMinor: boolean
}

/** Compact shareable board state (only non-defaults are encoded). */
export type IntelligenceShareState = {
  city: string
  zip?: string | null
  tx?: 'all' | 'sale' | 'rental'
  cls?: 'all' | 'residential' | 'commercial'
  property?: 'all' | 'homes' | 'multi' | 'condos'
  bedsMin?: number
  bedsMax?: number
  bathsMin?: number
  bathsMax?: number
  vintageMin?: number
  vintageMax?: number
  /** true = New, false = Not New, null/omit = any */
  newConstruction?: boolean | null
  status?: 'all' | 'new' | 'reduced' | 'active'
  sort?: string
  dir?: 'asc' | 'desc'
  view?: 'large' | 'grid' | 'line' | 'map'
  mapOn?: boolean
  mapLayout?: 'top' | 'side'
  furnished?: string | null
  /** Include plain "Under Contract" rows (Continue to Show always shows). */
  underContract?: boolean
  minPrice?: number
  maxPrice?: number | null
  minSqft?: number
  maxSqft?: number | null
  /** Days-on-market band id from the DOM mini chart (`{tierId}:{min}-{max}`). */
  domBand?: string | null
  /**
   * When true, Intelligence resets cookie/memory minor filters (beds, zip,
   * vintage, etc.) that are not explicitly present in the share URL.
   */
  resetMinor?: boolean
}

const TX_SHORT: Record<string, 'all' | 'sale' | 'rental'> = {
  a: 'all',
  s: 'sale',
  r: 'rental',
  all: 'all',
  sale: 'sale',
  rental: 'rental',
}
const TX_TO_SHORT: Record<'all' | 'sale' | 'rental', string> = {
  all: 'a',
  sale: 's',
  rental: 'r',
}

const CLS_SHORT: Record<string, 'all' | 'residential' | 'commercial'> = {
  a: 'all',
  r: 'residential',
  c: 'commercial',
  all: 'all',
  residential: 'residential',
  commercial: 'commercial',
}
const CLS_TO_SHORT: Record<'all' | 'residential' | 'commercial', string> = {
  all: 'a',
  residential: 'r',
  commercial: 'c',
}

const PROP_SHORT: Record<string, 'all' | 'homes' | 'multi' | 'condos'> = {
  a: 'all',
  h: 'homes',
  m: 'multi',
  co: 'condos',
  all: 'all',
  homes: 'homes',
  multi: 'multi',
  condos: 'condos',
}
const PROP_TO_SHORT: Record<'all' | 'homes' | 'multi' | 'condos', string> = {
  all: 'a',
  homes: 'h',
  multi: 'm',
  condos: 'co',
}

const VIEW_SHORT: Record<string, 'large' | 'grid' | 'line' | 'map'> = {
  lg: 'large',
  g: 'grid',
  l: 'line',
  mp: 'map',
  large: 'large',
  grid: 'grid',
  line: 'line',
  map: 'map',
}
const VIEW_TO_SHORT: Record<'large' | 'grid' | 'line' | 'map', string> = {
  large: 'lg',
  grid: 'g',
  line: 'l',
  map: 'mp',
}

const MAP_LAYOUT_SHORT: Record<string, 'top' | 'side'> = {
  t: 'top',
  s: 'side',
  top: 'top',
  side: 'side',
}

function parseRange(
  raw: string | null,
): { min: number | null; max: number | null } {
  if (!raw) return { min: null, max: null }
  const m = raw.trim().match(/^(\d+)(?:-(\d+))?$/)
  if (!m) return { min: null, max: null }
  const min = Number(m[1])
  const max = m[2] != null ? Number(m[2]) : min
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: null, max: null }
  }
  return { min, max }
}

function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`
}

/**
 * Compact Intelligence share path — short keys, omit defaults.
 * Example: `/intelligence?c=Westport&tx=s&b=3&ba=2&sort=price&dir=d`
 */
export function buildIntelligenceShareHref(state: IntelligenceShareState): string {
  const params = new URLSearchParams()
  const city = state.city?.trim() || 'All'
  if (city && city !== 'All') params.set('c', city)

  const zip = state.zip?.trim()
  if (zip) params.set('z', zip)

  if (state.tx && state.tx !== 'all') params.set('tx', TX_TO_SHORT[state.tx])
  if (state.cls && state.cls !== 'all') params.set('cls', CLS_TO_SHORT[state.cls])
  if (state.property && state.property !== 'all') {
    params.set('prop', PROP_TO_SHORT[state.property])
  }

  const bedsMin = state.bedsMin ?? 0
  const bedsMax = state.bedsMax ?? 6
  if (bedsMin > 0 || bedsMax < 6) {
    params.set('b', formatRange(bedsMin, bedsMax))
  }

  const bathsMin = state.bathsMin ?? 0
  const bathsMax = state.bathsMax ?? 6
  if (bathsMin > 0 || bathsMax < 6) {
    params.set('ba', formatRange(bathsMin, bathsMax))
  }

  const vMin = state.vintageMin ?? 0
  const vMax = state.vintageMax ?? 6
  if (vMin > 0 || vMax < 6) {
    params.set('v', formatRange(vMin, vMax))
  }

  if (state.newConstruction === true) params.set('nc', '1')
  else if (state.newConstruction === false) params.set('nc', '0')
  if (state.status && state.status !== 'all') params.set('st', state.status)

  // Always encode sort + dir + view so Back restores the board the visitor left
  // (omitting defaults let the recipient's cookie win and wipe the sort).
  const sort = state.sort?.trim() || 'score'
  params.set('sort', sort)
  params.set('dir', state.dir === 'asc' ? 'a' : 'd')
  const view = state.view?.trim()
  if (view === 'large' || view === 'grid' || view === 'line') {
    params.set('view', VIEW_TO_SHORT[view])
  } else if (view === 'map') {
    params.set('view', VIEW_TO_SHORT.grid)
  }
  const mapOn = state.mapOn === true || view === 'map'
  if (mapOn) {
    params.set('map', '1')
    if (state.mapLayout === 'side') params.set('ml', 's')
  }

  if (state.furnished && state.furnished !== 'all') {
    params.set('furn', state.furnished)
  }
  if (state.underContract) params.set('uc', '1')

  const hasMinPrice = state.minPrice != null && state.minPrice > 0
  const hasMaxPrice =
    state.maxPrice != null && Number.isFinite(state.maxPrice)
  if (hasMinPrice) {
    params.set('pmin', String(Math.round(state.minPrice!)))
  }
  if (hasMaxPrice) {
    params.set('pmax', String(Math.round(state.maxPrice!)))
  }
  if (state.minSqft != null && state.minSqft > 0) {
    params.set('smin', String(Math.round(state.minSqft)))
  }
  if (state.maxSqft != null && Number.isFinite(state.maxSqft)) {
    params.set('smax', String(Math.round(state.maxSqft)))
  }

  const domBand = state.domBand?.trim()
  if (domBand) params.set('dom', domBand)

  if (state.resetMinor) params.set('rst', '1')

  const qs = params.toString()
  return qs ? `/intelligence?${qs}` : '/intelligence'
}

/** Compact price token for share titles — e.g. 2000 → 2K, 1_500_000 → 1.5M (no $). */
function formatSharePriceToken(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const s =
      m % 1 === 0
        ? String(m)
        : m.toFixed(1).replace(/\.0$/, '')
    return `${s}M`
  }
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}

function formatSharePriceRangeLabel(
  minPrice?: number,
  maxPrice?: number | null,
): string | null {
  const hasMin = minPrice != null && minPrice > 0
  const hasMax = maxPrice != null && Number.isFinite(maxPrice)
  if (!hasMin && !hasMax) return null
  if (hasMin && hasMax) {
    // Prefer a shared unit: 2000–10000 → 2-10K
    if (
      minPrice! >= 1000 &&
      maxPrice! >= 1000 &&
      minPrice! < 1_000_000 &&
      maxPrice! < 1_000_000
    ) {
      return `${Math.round(minPrice! / 1000)}-${Math.round(maxPrice! / 1000)}K`
    }
    return `${formatSharePriceToken(minPrice!)}-${formatSharePriceToken(maxPrice!)}`
  }
  if (hasMin) return `From ${formatSharePriceToken(minPrice!)}`
  return `Under ${formatSharePriceToken(maxPrice!)}`
}

function formatShareSqftRangeLabel(
  minSqft?: number,
  maxSqft?: number | null,
): string | null {
  const hasMin = minSqft != null && minSqft > 0
  const hasMax = maxSqft != null && Number.isFinite(maxSqft)
  if (!hasMin && !hasMax) return null
  if (hasMin && hasMax) return `${Math.round(minSqft!)}-${Math.round(maxSqft!)} sqft`
  if (hasMin) return `${Math.round(minSqft!)}+ sqft`
  return `up to ${Math.round(maxSqft!)} sqft`
}

function formatShareCountRangeLabel(
  min: number,
  max: number,
  unit: string,
): string | null {
  if (min <= 0 && max >= 6) return null
  if (min === max) return `${min}${unit}`
  if (min > 0 && max < 6) return `${min}-${max}${unit}`
  if (min > 0) return `${min}+${unit}`
  return `up to ${max}${unit}`
}

export const INTELLIGENCE_SHARE_TITLE_DEFAULT = 'Market Intelligence'

/**
 * Human-readable share title for Intelligence.
 * No narrowed filters → `Market Intelligence`.
 * Otherwise spaced words, e.g. `Westport Rentals 3Bed+ 2Ba+ 7-12K`.
 * Sort and board view stay out of the title — they are in the URL.
 */
export function buildIntelligenceShareTitle(state: IntelligenceShareState): string {
  const parts: string[] = []

  const city = state.city?.trim()
  if (city && city !== 'All') parts.push(city)

  const zip = state.zip?.trim()
  if (zip) parts.push(zip)

  if (state.tx === 'sale') parts.push('Sales')
  else if (state.tx === 'rental') parts.push('Rentals')

  if (state.cls === 'residential') parts.push('Residential')
  else if (state.cls === 'commercial') parts.push('Commercial')

  if (state.property === 'homes') parts.push('Homes')
  else if (state.property === 'multi') parts.push('Multi')
  else if (state.property === 'condos') parts.push('Condos')

  const beds = formatShareCountRangeLabel(
    state.bedsMin ?? 0,
    state.bedsMax ?? 6,
    'Bed',
  )
  if (beds) parts.push(beds)

  const baths = formatShareCountRangeLabel(
    state.bathsMin ?? 0,
    state.bathsMax ?? 6,
    'Ba',
  )
  if (baths) parts.push(baths)

  const vintage = formatShareCountRangeLabel(
    state.vintageMin ?? 0,
    state.vintageMax ?? 6,
    ' Vintage',
  )
  if (vintage) parts.push(vintage)

  if (state.newConstruction === true) parts.push('New construction')
  else if (state.newConstruction === false) parts.push('Not new construction')

  if (state.status === 'new') parts.push('New listings')
  else if (state.status === 'reduced') parts.push('Reduced')
  else if (state.status === 'active') parts.push('Active')

  if (state.furnished && state.furnished !== 'all') {
    const furn = state.furnished.trim()
    parts.push(furn.charAt(0).toUpperCase() + furn.slice(1))
  }

  if (state.underContract) parts.push('Incl. under contract')

  const price = formatSharePriceRangeLabel(state.minPrice, state.maxPrice)
  if (price) parts.push(price)

  const sqft = formatShareSqftRangeLabel(state.minSqft, state.maxSqft)
  if (sqft) parts.push(sqft)

  return parts.length === 0 ? INTELLIGENCE_SHARE_TITLE_DEFAULT : parts.join(' ')
}

/** One-line description for OG / Twitter cards. No I/O — string formatting only. */
export function buildIntelligenceShareDescription(
  state: IntelligenceShareState,
): string {
  const title = buildIntelligenceShareTitle(state)
  if (title === INTELLIGENCE_SHARE_TITLE_DEFAULT) {
    return 'Live deal board for Fairfield County, CT. Every listing scored against our proprietary deal model.'
  }
  return `${title}. Live TMRE deal board — every listing scored against our proprietary deal model.`
}

/** Map inbound URL parse → share state (metadata + title use the same path). */
export function intelligenceShareStateFromParsed(
  parsed: ParsedIntelligenceSearch,
): IntelligenceShareState {
  return {
    city: parsed.city,
    zip: parsed.zip,
    tx: parsed.tx ?? undefined,
    cls: parsed.cls ?? undefined,
    property: parsed.property ?? undefined,
    bedsMin: parsed.bedsMin ?? undefined,
    bedsMax: parsed.bedsMax ?? undefined,
    bathsMin: parsed.bathsMin ?? undefined,
    bathsMax: parsed.bathsMax ?? undefined,
    vintageMin: parsed.vintageMin ?? undefined,
    vintageMax: parsed.vintageMax ?? undefined,
    newConstruction: parsed.newConstruction,
    status: parsed.status ?? undefined,
    sort: parsed.sort ?? undefined,
    dir: parsed.dir ?? undefined,
    view: parsed.view ?? undefined,
    mapOn: parsed.mapOn || parsed.view === 'map',
    mapLayout: parsed.mapLayout ?? undefined,
    furnished: parsed.furnished,
    underContract: parsed.underContract,
    minPrice: parsed.minPrice ?? undefined,
    maxPrice: parsed.maxPrice,
    minSqft: parsed.minSqft ?? undefined,
    maxSqft: parsed.maxSqft,
    domBand: parsed.domBand,
  }
}

export function intelligenceShareUrl(
  state: IntelligenceShareState,
  origin?: string,
): string {
  const path = buildIntelligenceShareHref(state)
  const base =
    origin?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  return base ? `${base}${path}` : path
}

type CriteriaLike = {
  town: string | null
  tx: 'sale' | 'rental' | 'all' | null
  propertyClass: 'residential' | 'commercial' | 'all' | null
  saleProperty: string | null
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  zip: string | null
  newConstruction: boolean | null
}

function asShareProperty(
  raw: string | null,
): 'all' | 'homes' | 'multi' | 'condos' {
  if (raw === 'homes' || raw === 'multi' || raw === 'condos') return raw
  return 'all'
}

/** Intelligence deep-link for a saved-search / visitor criteria snapshot. */
export function intelligenceSearchHrefFromCriteria(c: CriteriaLike): string {
  return buildIntelligenceShareHref({
    city: c.town?.trim() || 'All',
    zip: c.zip,
    tx: c.tx ?? 'all',
    cls: c.propertyClass ?? 'all',
    property: asShareProperty(c.saleProperty),
    bedsMin: c.minBeds ?? undefined,
    bedsMax: c.maxBeds ?? undefined,
    bathsMin: c.minBaths ?? undefined,
    bathsMax: c.maxBaths ?? undefined,
    newConstruction: c.newConstruction,
    resetMinor: true,
  })
}

/**
 * Parse inbound Intelligence search — supports compact share keys (`c`, `b`, …)
 * and legacy listing deep-link keys (`city`, `beds`, `exact`, …).
 */
function hasIntelligenceShareParams(searchParams: URLSearchParams): boolean {
  const keys = [
    'c',
    'city',
    'z',
    'zip',
    'tx',
    'cls',
    'prop',
    'property',
    'b',
    'beds',
    'ba',
    'baths',
    'v',
    'nc',
    'new',
    'exact',
    'st',
    'status',
    'sort',
    'dir',
    'view',
    'map',
    'ml',
    'furn',
    'uc',
    'pmin',
    'pmax',
    'smin',
    'smax',
    'dom',
    'rst',
  ]
  return keys.some((k) => searchParams.has(k))
}

export function parseIntelligenceSearchParams(
  searchParams: URLSearchParams,
): ParsedIntelligenceSearch | null {
  if (!hasIntelligenceShareParams(searchParams)) return null

  const cityRaw =
    searchParams.get('c')?.trim() || searchParams.get('city')?.trim()

  let city: TmreTown | 'All' = 'All'
  if (cityRaw && cityRaw !== 'All') {
    const town = normalizeTownName(cityRaw)
    if (!town || !(TMRE_TOWNS as readonly string[]).includes(town)) return null
    city = town as TmreTown
  }

  const txRaw = (
    searchParams.get('tx') ?? ''
  )
    .trim()
    .toLowerCase()
  const tx = TX_SHORT[txRaw] ?? null

  const clsRaw = (
    searchParams.get('cls') ?? ''
  )
    .trim()
    .toLowerCase()
  const cls = CLS_SHORT[clsRaw] ?? null

  const propertyRaw = (
    searchParams.get('prop') ??
    searchParams.get('property') ??
    ''
  )
    .trim()
    .toLowerCase()
  const property = PROP_SHORT[propertyRaw] ?? null

  // Compact ranges: b=3 or b=3-5. Legacy: beds=3 (+ exact=1 → max=beds).
  const bedsCompact = parseRange(searchParams.get('b'))
  const bathsCompact = parseRange(searchParams.get('ba'))
  const vintageCompact = parseRange(searchParams.get('v'))

  const bedsLegacy = searchParams.get('beds')?.trim()
  const bathsLegacy = searchParams.get('baths')?.trim()
  const exactBeds = searchParams.get('exact') === '1'

  let bedsMin = bedsCompact.min
  let bedsMax = bedsCompact.max
  if (bedsMin == null && bedsLegacy && /^[0-6]$/.test(bedsLegacy)) {
    bedsMin = Number(bedsLegacy)
    bedsMax = exactBeds ? bedsMin : 6
  }

  let bathsMin = bathsCompact.min
  let bathsMax = bathsCompact.max
  if (bathsMin == null && bathsLegacy && /^[0-6]$/.test(bathsLegacy)) {
    bathsMin = Number(bathsLegacy)
    bathsMax = 6
  }

  const zip =
    searchParams.get('z')?.trim() || searchParams.get('zip')?.trim() || null

  const statusRaw = (
    searchParams.get('st') ??
    searchParams.get('status') ??
    ''
  )
    .trim()
    .toLowerCase()
  const status =
    statusRaw === 'new' ||
    statusRaw === 'reduced' ||
    statusRaw === 'active' ||
    statusRaw === 'all'
      ? statusRaw
      : null

  const sortRaw = searchParams.get('sort')?.trim().toLowerCase() || null
  const sort =
    sortRaw &&
    [
      'score',
      'town',
      'beds',
      'baths',
      'price',
      'ppsf',
      'sqft',
      'dom',
      'year',
      'status',
    ].includes(sortRaw)
      ? sortRaw
      : null
  const dirRaw = (searchParams.get('dir') ?? '').trim().toLowerCase()
  const dir =
    dirRaw === 'a' || dirRaw === 'asc'
      ? 'asc'
      : dirRaw === 'd' || dirRaw === 'desc'
        ? 'desc'
        : null
  const viewRaw = (searchParams.get('view') ?? '').trim().toLowerCase()
  const viewParsed = VIEW_SHORT[viewRaw] ?? null
  const mapOn =
    searchParams.get('map') === '1' ||
    searchParams.get('map') === 'on' ||
    viewParsed === 'map'
  const view = viewParsed === 'map' ? null : viewParsed
  const mapLayoutRaw = (searchParams.get('ml') ?? '').trim().toLowerCase()
  const mapLayout = MAP_LAYOUT_SHORT[mapLayoutRaw] ?? null

  const pmin = Number(searchParams.get('pmin'))
  const pmax = Number(searchParams.get('pmax'))
  const smin = Number(searchParams.get('smin'))
  const smax = Number(searchParams.get('smax'))

  return {
    city,
    zip,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    vintageMin: vintageCompact.min,
    vintageMax: vintageCompact.max,
    tx,
    cls,
    property,
    newConstruction: (() => {
      const nc = searchParams.get('nc')
      if (nc === '1' || searchParams.get('new') === '1') return true
      if (nc === '0') return false
      return null
    })(),
    exactBeds,
    status,
    sort,
    dir,
    view,
    mapOn,
    mapLayout,
    furnished: searchParams.get('furn')?.trim() || null,
    underContract: searchParams.get('uc') === '1',
    minPrice: Number.isFinite(pmin) && pmin > 0 ? pmin : null,
    maxPrice: Number.isFinite(pmax) && pmax > 0 ? pmax : null,
    minSqft: Number.isFinite(smin) && smin > 0 ? smin : null,
    maxSqft: Number.isFinite(smax) && smax > 0 ? smax : null,
    domBand: searchParams.get('dom')?.trim() || null,
    resetMinor: searchParams.get('rst') === '1',
  }
}
