/**
 * Shared shape and text helpers for the browser-resident address index.
 *
 * This module is imported by client code, so it must not reach anything
 * server-only. `lib/property-address.ts` carries the same street-suffix idea
 * but pulls in the Vision Appraisal scraper, so the map is repeated here.
 */

/** Bump to invalidate every resident copy in IndexedDB. */
export const ADDRESS_INDEX_VERSION = 1

export const ADDRESS_INDEX_CACHE_KEY = `address-index:v${ADDRESS_INDEX_VERSION}`

/**
 * Field separators. `~` and `|` cannot appear in an MLS id, street line, zip,
 * or town name, so rows never need escaping.
 */
export const ADDRESS_INDEX_ROW_SEP = '\n'
export const ADDRESS_INDEX_FIELD_SEP = '~'
export const ADDRESS_INDEX_STREET_SEP = '|'

/** Row flag bits. */
export const ADDRESS_FLAG_ON_MARKET = 1
export const ADDRESS_FLAG_RENTAL = 2

/**
 * Wire format. `streets` holds each street line once as `street|townIdx`;
 * `rows` is one line per address as
 * `house~streetIdx~mlsId~flags~priceK~closeYear~zip`. Zip lives on the row
 * because streets such as Main Street in Norwalk span several zips. Values
 * stay decimal rather than base36 so a payload can be read in devtools — gzip
 * removes the difference.
 */
export type AddressIndexPayload = {
  v: number
  generatedAt: string
  towns: string[]
  streets: string[]
  rows: string
  addresses: number
}

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
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  highway: 'hwy',
  hwy: 'hwy',
  parkway: 'pkwy',
  pkwy: 'pkwy',
  square: 'sq',
  sq: 'sq',
  turnpike: 'tpke',
  tpke: 'tpke',
  extension: 'ext',
  ext: 'ext',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
}

/**
 * Collapse a street line to its match form: lowercase, punctuation stripped,
 * suffixes and compass words abbreviated. `Kings Highway South` and
 * `kings hwy s` both land on `kings hwy s`.
 */
export function normalizeStreetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => STREET_SUFFIX[token] ?? token)
    .join(' ')
}

/**
 * `42 Treadwell Avenue` → house `42`, street `Treadwell Avenue`.
 * Also handles ranges and fractions the MLS uses: `36-38`, `16-1/2`, `17A`.
 */
export const HOUSE_NUMBER_PATTERN =
  /^(\d+\s*\/\s*\d+|\d+[a-z]?(?:\s*-\s*(?:\d+\s*\/\s*\d+|\d+[a-z]?))?)\s+(.+)$/i

export function splitHouseNumber(streetLine: string): { house: string; street: string } {
  const trimmed = streetLine.trim().replace(/\s+/g, ' ')
  const match = trimmed.match(HOUSE_NUMBER_PATTERN)
  if (!match) return { house: '', street: trimmed }
  return { house: match[1]!.replace(/\s*([-/])\s*/g, '$1'), street: match[2]! }
}

/** Leading digits of a house number for ordering and exact matching, else -1. */
export function houseNumberValue(house: string): number {
  const digits = house.match(/^\d+/)?.[0]
  if (!digits) return -1
  const value = Number(digits)
  return Number.isFinite(value) ? value : -1
}
