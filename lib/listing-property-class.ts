/**
 * Residential sale/rental property subtype used for months-supply cache keys
 * and Intelligence / Stats filters (All · Homes · Multi-family · Condos).
 */

export const LISTING_PROPERTY_CLASSES = ['all', 'homes', 'multi', 'condos'] as const

export type ListingPropertyClass = (typeof LISTING_PROPERTY_CLASSES)[number]

export function isCommercialPropertyType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType)
}

export function isCondoPropertyType(propertyType: string): boolean {
  return /condo|co-op/i.test(propertyType)
}

export function isMultiFamilyPropertyType(propertyType: string): boolean {
  return /multi|duplex|triplex|fourplex|2-family|3-family|4-family/i.test(propertyType)
}

/** Single-family / homes residual (not commercial, condo, or multi). */
export function isHomePropertyType(propertyType: string): boolean {
  if (isCommercialPropertyType(propertyType)) return false
  if (isCondoPropertyType(propertyType)) return false
  if (isMultiFamilyPropertyType(propertyType)) return false
  return true
}

export function listingMatchesPropertyClass(
  propertyType: string,
  propertyClass: ListingPropertyClass,
): boolean {
  if (propertyClass === 'all') return true
  if (propertyClass === 'homes') return isHomePropertyType(propertyType)
  if (propertyClass === 'multi') return isMultiFamilyPropertyType(propertyType)
  if (propertyClass === 'condos') return isCondoPropertyType(propertyType)
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
