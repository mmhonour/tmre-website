/**
 * Residential sale/rental property subtype used for months-supply cache keys
 * and Intelligence / Stats / Deal of the Day filters (All · Homes · Multi · Condos).
 */

export const LISTING_PROPERTY_CLASSES = ['all', 'homes', 'multi', 'condos'] as const

export type ListingPropertyClass = (typeof LISTING_PROPERTY_CLASSES)[number]

/** String PropertyType or a listing-like object (style + RETS raw subtypes). */
export type PropertyClassListingInput =
  | string
  | {
      propertyType?: string | null
      style?: string | null
      raw?: Record<string, string> | null
    }

/**
 * SmartMLS often stores "Residential" on PropertyType with the real class in
 * PropertySubType / style — haystack both so condo/multi pills match cache + live.
 */
export function propertyClassHaystack(input: PropertyClassListingInput): string {
  if (typeof input === 'string') return input
  return [
    input.propertyType,
    input.style,
    input.raw?.PropertyType,
    input.raw?.PropertySubType,
    input.raw?.MRD_TYP,
    input.raw?.ArchitecturalStyle,
  ]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .join(' ')
}

export function isCommercialPropertyType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType)
}

export function isCondoPropertyType(propertyType: string): boolean {
  return /condo|condominium|co-?op|cooperative/i.test(propertyType)
}

export function isMultiFamilyPropertyType(propertyType: string): boolean {
  return /multi|duplex|triplex|fourplex|2-family|3-family|4-family|two[\s-]?family|three[\s-]?family|four[\s-]?family|residential\s*income|income\s*property/i.test(
    propertyType,
  )
}

/** Single-family / homes residual (not commercial, condo, or multi). */
export function isHomePropertyType(propertyType: string): boolean {
  if (isCommercialPropertyType(propertyType)) return false
  if (isCondoPropertyType(propertyType)) return false
  if (isMultiFamilyPropertyType(propertyType)) return false
  return true
}

export function listingMatchesPropertyClass(
  listing: PropertyClassListingInput,
  propertyClass: ListingPropertyClass,
): boolean {
  if (propertyClass === 'all') return true
  const hay = propertyClassHaystack(listing)
  if (propertyClass === 'homes') return isHomePropertyType(hay)
  if (propertyClass === 'multi') return isMultiFamilyPropertyType(hay)
  if (propertyClass === 'condos') return isCondoPropertyType(hay)
  return true
}

export function parseListingPropertyClass(
  value: string | null | undefined,
): ListingPropertyClass {
  const raw = (value ?? 'all').trim().toLowerCase()
  if (raw === 'homes' || raw === 'multi' || raw === 'condos') return raw
  return 'all'
}

export function listingPropertyClassLabel(propertyClass: ListingPropertyClass): string {
  switch (propertyClass) {
    case 'homes':
      return 'Homes'
    case 'multi':
      return 'Multi-family'
    case 'condos':
      return 'Condos'
    default:
      return 'All types'
  }
}
