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
    .map((token) => STREET_SUFFIX[token] ?? token)
    .join(' ')
    .trim()
}

export function normalizePropertyAddress(town: string, street: string, zip?: string | null): string {
  const parts = [normalizeStreetLine(street), town.trim().toLowerCase()]
  const zip5 = zip?.trim().slice(0, 5)
  if (zip5 && /^\d{5}$/.test(zip5)) parts.push(zip5)
  return parts.join('|')
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
