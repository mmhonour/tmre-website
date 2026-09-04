import { parcelNumberFromRaw } from '@/lib/listing-property-tax'
import { parseStreet } from '@/lib/vision-appraisal'

const STREET_SUFFIX: Record<string, string> = {
  street: 'st',
  st: 'st',
  road: 'rd',
  rd: 'rd',
  avenue: 'ave',
  ave: 'ave',
  drive: 'dr',
  dr: 'dr',
  lane: 'ln',
  ln: 'ln',
  court: 'ct',
  ct: 'ct',
  boulevard: 'blvd',
  blvd: 'blvd',
  place: 'pl',
  pl: 'pl',
  circle: 'cir',
  cir: 'cir',
  way: 'way',
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  highway: 'hwy',
  hwy: 'hwy',
  parkway: 'pkwy',
  pkwy: 'pkwy',
  pky: 'pkwy',
  pkway: 'pkwy',
  square: 'sq',
  sq: 'sq',
  turnpike: 'tpke',
  tpke: 'tpke',
  extension: 'ext',
  ext: 'ext',
  /**
   * Assessor abbreviations that USPS does not use, so only the CAMA side of a
   * match ever writes them. Ridgefield, Wilton and New Canaan all file `LA` for
   * Lane — 14,287 street lines between them — which is why those towns matched
   * worst before this: the street simply looked absent. Expanding the short
   * form leaves the spelled-out word's own canonicalization untouched.
   *
   * `tr` is ambiguous (Trail here, Terrace in some towns). Getting it wrong
   * only leaves a listing unmatched, since both sides run through this same
   * map, so it cannot produce a false match.
   */
  la: 'ln',
  cmns: 'commons',
  pk: 'park',
  hgwy: 'hwy',
  tr: 'trl',
  north: 'n',
  n: 'n',
  south: 's',
  s: 's',
  east: 'e',
  e: 'e',
  west: 'w',
  w: 'w',
  northeast: 'ne',
  ne: 'ne',
  northwest: 'nw',
  nw: 'nw',
  southeast: 'se',
  se: 'se',
  southwest: 'sw',
  sw: 'sw',
}

/**
 * Mid-name USPS-style words (not street types). MLS `BLIND BRK RD S` and
 * VGSI `Blind Brook Rd S` must land on the same match key.
 * Skip short/ambiguous collapses (park→pk, hill→hl, island→is, cross→xing).
 */
const STREET_NAME_WORDS: Record<string, string> = {
  brook: 'brk',
  brk: 'brk',
  brooks: 'brks',
  brks: 'brks',
  mount: 'mt',
  mt: 'mt',
  mountain: 'mtn',
  mtn: 'mtn',
  heights: 'hts',
  hts: 'hts',
  crossing: 'xing',
  xing: 'xing',
  point: 'pt',
  pt: 'pt',
  ridge: 'rdg',
  rdg: 'rdg',
  harbor: 'hbr',
  harbour: 'hbr',
  hbr: 'hbr',
  creek: 'crk',
  crk: 'crk',
  landing: 'lndg',
  lndg: 'lndg',
  meadow: 'mdw',
  mdw: 'mdw',
  meadows: 'mdws',
  mdws: 'mdws',
  valley: 'vly',
  vly: 'vly',
  center: 'ctr',
  centre: 'ctr',
  ctr: 'ctr',
}

/** Street types only — not compass. Used to drop a trailing `rd` VGSI omitted. */
const STREET_TYPE_CANON = new Set([
  'st',
  'rd',
  'ave',
  'dr',
  'ln',
  'ct',
  'blvd',
  'pl',
  'cir',
  'way',
  'ter',
  'trl',
  'hwy',
  'pkwy',
  'sq',
  'tpke',
  'ext',
])

/**
 * Drop a final street type only (`1 hemlock hill rd` → `1 hemlock hill`).
 * Does not strip a type before a compass (`1 kings hwy n` stays intact).
 */
export function stripTrailingStreetType(street: string): string {
  const tokens = normalizeStreetLine(street).split(' ').filter(Boolean)
  const last = tokens[tokens.length - 1]
  if (tokens.length >= 3 && last && STREET_TYPE_CANON.has(last)) {
    tokens.pop()
  }
  return tokens.join(' ')
}

export type PropertyAddressSource = 'mls' | 'assessor' | 'both'

export type PropertyAddressRow = {
  propertyKey: string
  parcelNumber: string | null
  town: string
  street: string
  unit: string | null
  zip: string | null
  addressFull: string
  addressNorm: string
  listingId: string | null
  mlsId: string | null
  source: PropertyAddressSource
  verifiedAt: string
  syncedAt: string
}

export function normalizeParcelNumber(parcel: string | null | undefined): string | null {
  const raw = parcel?.trim()
  if (!raw) return null
  const compact = raw.replace(/\s+/g, '').toUpperCase()
  return compact || null
}

export function normalizeStreetLine(street: string): string {
  return street
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => STREET_SUFFIX[token] ?? STREET_NAME_WORDS[token] ?? token)
    .join(' ')
    .trim()
}

/** Canon short token → spelled USPS word. RETS `*Ln*` does not hit `Lane`. */
const STREET_TYPE_LONG: Record<string, string> = {
  st: 'street',
  rd: 'road',
  ave: 'avenue',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  blvd: 'boulevard',
  pl: 'place',
  cir: 'circle',
  ter: 'terrace',
  trl: 'trail',
  hwy: 'highway',
  pkwy: 'parkway',
  sq: 'square',
  tpke: 'turnpike',
  ext: 'extension',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
}

const STREET_NAME_LONG: Record<string, string> = {
  brk: 'brook',
  brks: 'brooks',
  mt: 'mount',
  mtn: 'mountain',
  hts: 'heights',
  xing: 'crossing',
  pt: 'point',
  rdg: 'ridge',
  hbr: 'harbor',
  crk: 'creek',
  lndg: 'landing',
  mdw: 'meadow',
  mdws: 'meadows',
  vly: 'valley',
  ctr: 'center',
}

/**
 * RETS / LIKE spellings for one street: original, canon (`ln`/`rd`),
 * and expanded (`lane`/`road`). `5 Locust Ln` and `5 Locust Lane` both
 * produce a variant SmartMLS UnparsedAddress can contain.
 */
export function streetSearchVariants(street: string): string[] {
  const original = street.replace(/\s+/g, ' ').trim()
  const canon = normalizeStreetLine(original)
  if (!canon) return original ? [original] : []
  const expanded = canon
    .split(' ')
    .map((token) => STREET_TYPE_LONG[token] ?? STREET_NAME_LONG[token] ?? token)
    .join(' ')
  const seen = new Set<string>()
  const out: string[] = []
  for (const variant of [original, canon, expanded]) {
    const key = variant.toLowerCase()
    if (!variant || seen.has(key)) continue
    seen.add(key)
    out.push(variant)
  }
  return out
}

export function normalizePropertyAddress(town: string, street: string, zip?: string | null): string {
  const parts = [normalizeStreetLine(street), town.trim().toLowerCase()]
  const zip5 = zip?.trim().slice(0, 5)
  if (zip5 && /^\d{5}$/.test(zip5)) parts.push(zip5)
  return parts.join('|')
}

/**
 * Join key for Vision ↔ listings. Re-runs street-token canonicalization so a
 * stored Vision `28 bulkley ave north|westport` matches MLS `28 BULKLEY AVE N`,
 * and `1 Blind Brook Rd S` matches MLS `1 BLIND BRK RD S`.
 * Also strips a trailing `|06880` (Vision usually has no zip, MLS usually does).
 */
export function addressMatchKey(addressNorm: string): string {
  const stripped = addressNorm.replace(/\|\d{5}$/, '')
  const [street, town, ...rest] = stripped.split('|')
  const canonStreet = normalizeStreetLine(street ?? '')
  const canonTown = (town ?? '').trim().toLowerCase()
  return [canonStreet, canonTown, ...rest].filter((part) => part.length > 0).join('|')
}

/**
 * Exact key with optional trailing street type removed.
 * MLS `1 Hemlock Hill Road` ↔ VGSI `1 HEMLOCK HILL` (PID 8368).
 */
export function addressMatchKeyLoose(addressNorm: string): string {
  const exact = addressMatchKey(addressNorm)
  const [street, ...rest] = exact.split('|')
  const looseStreet = stripTrailingStreetType(street ?? '')
  return [looseStreet, ...rest].filter((part) => part.length > 0).join('|')
}

export function propertyKeyFromParcel(parcel: string | null | undefined): string | null {
  const normalized = normalizeParcelNumber(parcel)
  return normalized ? `parcel:${normalized}` : null
}

export function propertyKeyFromAddress(town: string, addressNorm: string): string {
  return `addr:${town.trim().toLowerCase()}:${addressNorm}`
}

export function resolvePropertyKey(params: {
  parcelNumber?: string | null
  town: string
  addressNorm: string
}): string {
  return propertyKeyFromParcel(params.parcelNumber) ?? propertyKeyFromAddress(params.town, params.addressNorm)
}

export function mergePropertyAddressSource(
  existing: PropertyAddressSource | null | undefined,
  incoming: PropertyAddressSource,
): PropertyAddressSource {
  if (!existing || existing === incoming) return incoming
  if (
    (existing === 'mls' && incoming === 'assessor') ||
    (existing === 'assessor' && incoming === 'mls')
  ) {
    return 'both'
  }
  return existing
}

export function formatPropertyAddressFull(
  street: string,
  town: string,
  zip?: string | null,
  unit?: string | null,
): string {
  const line = unit?.trim() ? `${street.trim()} ${unit.trim()}` : street.trim()
  const zip5 = zip?.trim().slice(0, 5)
  return zip5 ? `${line}, ${town}, CT ${zip5}` : `${line}, ${town}, CT`
}

export type PropertyAddressListing = {
  mlsId: string
  address: {
    street: string
    unit: string
    city: string
    postalCode: string
    full: string
  }
  raw?: Record<string, string>
}

export function listingToPropertyAddressDraft(
  listing: PropertyAddressListing,
  town: string,
  listingId: string,
): Omit<PropertyAddressRow, 'verifiedAt' | 'syncedAt'> {
  const street = listing.address.street?.trim() || listing.address.full?.trim() || ''
  const unit = listing.address.unit?.trim() || null
  const zip = listing.address.postalCode?.trim().slice(0, 5) || null
  const addressNorm = normalizePropertyAddress(town, street, zip)
  const parcelNumber = normalizeParcelNumber(parcelNumberFromRaw(listing.raw))
  const propertyKey = resolvePropertyKey({ parcelNumber, town, addressNorm })

  return {
    propertyKey,
    parcelNumber,
    town,
    street,
    unit,
    zip,
    addressFull: formatPropertyAddressFull(street, town, zip, unit),
    addressNorm,
    listingId,
    mlsId: listing.mlsId?.trim() || null,
    source: 'mls',
  }
}

export function assessorSaleToPropertyAddressDraft(
  town: string,
  saleAddress: string,
): Omit<PropertyAddressRow, 'verifiedAt' | 'syncedAt' | 'listingId' | 'mlsId' | 'parcelNumber'> & {
  parcelNumber: null
  listingId: null
  mlsId: null
} | null {
  const parsed = parseStreet(saleAddress)
  if (!parsed) return null

  const street = `${parsed.streetNo} ${parsed.streetName}`.trim()
  const addressNorm = normalizePropertyAddress(town, street, null)
  const propertyKey = propertyKeyFromAddress(town, addressNorm)

  return {
    propertyKey,
    parcelNumber: null,
    town,
    street,
    unit: null,
    zip: null,
    addressFull: formatPropertyAddressFull(street, town, null, null),
    addressNorm,
    listingId: null,
    mlsId: null,
    source: 'assessor',
  }
}

export function addressesLikelyMatch(
  a: { town: string; addressNorm: string },
  b: { town: string; addressNorm: string },
): boolean {
  return a.town.trim().toLowerCase() === b.town.trim().toLowerCase() && a.addressNorm === b.addressNorm
}
