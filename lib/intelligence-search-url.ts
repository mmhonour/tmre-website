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

  const params = new URLSearchParams()
  params.set('city', town)
  const zip = listing.address.postalCode?.trim()
  if (zip) params.set('zip', zip)
  params.set('beds', String(clampFilterCount(listing.beds)))
  params.set('baths', String(clampFilterCount(listing.baths)))
  params.set('tx', rental ? 'rental' : 'sale')

  if (commercial) {
    params.set('cls', 'commercial')
  } else {
    params.set('cls', 'residential')
    if (!rental) {
      const property = inferSaleProperty(listing.propertyType, listing.style)
      if (property !== 'homes') params.set('property', property)
    }
  }

  if (newConstruction) params.set('new', '1')
  params.set('exact', '1')

  return `/intelligence?${params.toString()}`
}

export type ParsedIntelligenceSearch = {
  city: TmreTown
  zip: string | null
  beds: string | null
  baths: string | null
  tx: 'all' | 'sale' | 'rental' | null
  cls: 'all' | 'residential' | 'commercial' | null
  property: 'all' | 'homes' | 'multi' | 'condos' | null
  newConstruction: boolean
  exactBeds: boolean
}

export function parseIntelligenceSearchParams(
  searchParams: URLSearchParams,
): ParsedIntelligenceSearch | null {
  const cityRaw = searchParams.get('city')?.trim()
  if (!cityRaw) return null

  const town = normalizeTownName(cityRaw)
  if (!town || !(TMRE_TOWNS as readonly string[]).includes(town)) return null

  const txRaw = searchParams.get('tx')?.trim().toLowerCase()
  const tx =
    txRaw === 'sale' || txRaw === 'rental' || txRaw === 'all' ? txRaw : null

  const clsRaw = searchParams.get('cls')?.trim().toLowerCase()
  const cls =
    clsRaw === 'residential' || clsRaw === 'commercial' || clsRaw === 'all'
      ? clsRaw
      : null

  const propertyRaw = searchParams.get('property')?.trim().toLowerCase()
  const property =
    propertyRaw === 'homes' ||
    propertyRaw === 'multi' ||
    propertyRaw === 'condos' ||
    propertyRaw === 'all'
      ? propertyRaw
      : null

  const bedsRaw = searchParams.get('beds')?.trim()
  const bathsRaw = searchParams.get('baths')?.trim()
  const beds =
    bedsRaw && /^[1-6]$/.test(bedsRaw) ? bedsRaw : null
  const baths =
    bathsRaw && /^[1-6]$/.test(bathsRaw) ? bathsRaw : null

  const zip = searchParams.get('zip')?.trim() || null

  return {
    city: town as TmreTown,
    zip,
    beds,
    baths,
    tx,
    cls,
    property,
    newConstruction: searchParams.get('new') === '1',
    exactBeds: searchParams.get('exact') === '1',
  }
}
