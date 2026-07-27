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
  newConstruction: boolean
  exactBeds: boolean
  status: 'all' | 'new' | 'reduced' | 'active' | null
  sort: string | null
  dir: 'asc' | 'desc' | null
  furnished: string | null
  minPrice: number | null
  maxPrice: number | null
  minSqft: number | null
  maxSqft: number | null
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
  newConstruction?: boolean
  status?: 'all' | 'new' | 'reduced' | 'active'
  sort?: string
  dir?: 'asc' | 'desc'
  furnished?: string | null
  minPrice?: number
  maxPrice?: number | null
  minSqft?: number
  maxSqft?: number | null
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

  if (state.newConstruction) params.set('nc', '1')
  if (state.status && state.status !== 'all') params.set('st', state.status)

  if (state.sort && state.sort !== 'score') {
    params.set('sort', state.sort)
    // Non-default sort: always encode dir (price/town/status default to asc in UI).
    params.set('dir', state.dir === 'asc' ? 'a' : 'd')
  } else if (state.dir === 'asc') {
    // Score defaults to desc — only encode ascending.
    params.set('dir', 'a')
  }

  if (state.furnished && state.furnished !== 'all') {
    params.set('furn', state.furnished)
  }

  if (state.minPrice != null && state.minPrice > 0) {
    params.set('pmin', String(Math.round(state.minPrice)))
  }
  if (state.maxPrice != null && Number.isFinite(state.maxPrice)) {
    params.set('pmax', String(Math.round(state.maxPrice)))
  }
  if (state.minSqft != null && state.minSqft > 0) {
    params.set('smin', String(Math.round(state.minSqft)))
  }
  if (state.maxSqft != null && Number.isFinite(state.maxSqft)) {
    params.set('smax', String(Math.round(state.maxSqft)))
  }

  const qs = params.toString()
  return qs ? `/intelligence?${qs}` : '/intelligence'
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
    'furn',
    'pmin',
    'pmax',
    'smin',
    'smax',
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

  const sort = searchParams.get('sort')?.trim() || null
  const dirRaw = (searchParams.get('dir') ?? '').trim().toLowerCase()
  const dir =
    dirRaw === 'a' || dirRaw === 'asc'
      ? 'asc'
      : dirRaw === 'd' || dirRaw === 'desc'
        ? 'desc'
        : null

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
    newConstruction:
      searchParams.get('nc') === '1' || searchParams.get('new') === '1',
    exactBeds,
    status,
    sort,
    dir,
    furnished: searchParams.get('furn')?.trim() || null,
    minPrice: Number.isFinite(pmin) && pmin > 0 ? pmin : null,
    maxPrice: Number.isFinite(pmax) && pmax > 0 ? pmax : null,
    minSqft: Number.isFinite(smin) && smin > 0 ? smin : null,
    maxSqft: Number.isFinite(smax) && smax > 0 ? smax : null,
  }
}
