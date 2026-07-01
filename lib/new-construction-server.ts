import 'server-only'

import type { Listing } from './rets'
import { NEW_CONSTRUCTION_KEYWORDS, NEW_CONSTRUCTION_MIN_YEAR } from './new-construction'

function collectRemarks(l: Listing): string {
  return [l.raw.PublicRemarks, l.raw.RemarksPublicAddendum, l.raw.RoomsAdditional, l.raw.PropertyInfo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function listingHaystack(l: Listing): string {
  return `${l.propertyType} ${l.style} ${collectRemarks(l)}`.toLowerCase()
}

function newConstructionTypeLabel(l: Listing): string {
  const v = l.raw?.NewConstructionType
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/** New builds and pre-construction — matches /new-construction inventory rules. */
export function isNewConstructionListing(l: Listing): boolean {
  const ncType = newConstructionTypeLabel(l)
  if (
    ncType &&
    ncType !== 'no/resale' &&
    ncType !== 'no' &&
    /completed|never occupied|under construction|torn down|rebuilt|new construction|to be built/.test(
      ncType,
    )
  ) {
    return true
  }

  if (l.yearBuilt != null && l.yearBuilt >= NEW_CONSTRUCTION_MIN_YEAR) return true
  const hay = listingHaystack(l)
  if (/new construction|newly constructed|new build|spec home|spec house/.test(hay)) {
    if (l.yearBuilt == null || l.yearBuilt >= 2015) return true
  }
  if (NEW_CONSTRUCTION_KEYWORDS.some((k) => hay.includes(k))) {
    if (l.yearBuilt == null || l.yearBuilt >= 2015) return true
  }
  return false
}
