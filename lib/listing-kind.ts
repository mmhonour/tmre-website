export type ListingKind = 'sale' | 'rental'

export const LISTING_KINDS = ['sale', 'rental'] as const

export function isRentalListing(listing: {
  propertyType: string
  raw?: Record<string, string>
}): boolean {
  const type = (listing.propertyType ?? '').trim()
  if (/rental|for lease|\blease\b/i.test(type)) return true

  const raw = listing.raw
  if (raw) {
    const hints = [
      raw.PropertyType,
      raw.PropertySubType,
      raw.TransactionType,
      raw.MRD_TYP,
      raw.StandardStatus,
    ]
      .filter(Boolean)
      .join(' ')
    if (/rent|lease/i.test(hints)) return true
  }

  return false
}

export function filterListingsByKind<
  T extends { propertyType: string; raw?: Record<string, string> },
>(listings: T[], kind: ListingKind): T[] {
  return listings.filter((l) =>
    kind === 'rental' ? isRentalListing(l) : !isRentalListing(l),
  )
}

export function parseListingKindParam(value: string | null | undefined): ListingKind {
  return value?.trim().toLowerCase() === 'rental' ? 'rental' : 'sale'
}
