/**
 * Wire types for the listing ↔ VGSI parcel pairing shown in the Admin panel.
 * Separate from `listing-vision-link.ts` because that module is `server-only`
 * and the panel that renders these is a client component.
 */

/** One `vision_addresses` row, trimmed to what the Admin panel shows. */
export type ListingVisionParcel = {
  visionPid: string
  /**
   * Our own parcel page, `/find/westport/{pid}`. Null for a Vision town that has
   * no `/find/{town}` route yet — the panel falls back to `vgsiHref`.
   */
  parcelHref: string | null
  /** VGSI's own printable Field Card PDF. */
  fieldCardHref: string | null
  /** VGSI `Parcel.aspx?pid=` page this row was scraped from. */
  vgsiHref: string
  addressFull: string | null
  mblu: string | null
  useCode: string | null
  ownerName: string | null
  assessedValue: number | null
  lastSalePrice: number | null
  lastSaleDate: string | null
  /**
   * `vision_addresses.mls_id` — the listing this parcel row points back at.
   * Same as the listing being viewed on a healthy pair; a different number means
   * the two sides of the join disagree.
   */
  linkedMlsId: string | null
}

export type ListingVisionLink = {
  /** Vision town the listing sits in — only towns in VISION_GIS_TOWNS get here. */
  town: string
  /** True when `listings.vision_pid` is stamped. */
  stamped: boolean
  /** The stamped parcel, resolved against `vision_addresses`. */
  parcel: ListingVisionParcel | null
  /**
   * Address-matched parcels when nothing is stamped, so an unmatched Westport
   * listing shows what it probably is rather than nothing at all.
   */
  candidates: ListingVisionParcel[]
  /**
   * Present when the PID is stamped but no `vision_addresses` row answers to it
   * (parcel re-numbered on VGSI, or crawled before the row was written).
   */
  danglingPid: string | null
}

function findSearchHref(query: string): string {
  return `/find?q=${encodeURIComponent(query)}`
}

/**
 * Admin-only click target for a listing street: stamped / single-candidate
 * parcel page, else Find search so you can see whether VGSI has a card.
 */
export function listingVisionAddressHref(
  vision: ListingVisionLink | null | undefined,
  addressQuery?: string | null,
): string | null {
  const query = addressQuery?.trim() ?? ''
  const parcelHref = vision?.parcel?.parcelHref?.trim()
  if (parcelHref) return parcelHref
  const dangling = vision?.danglingPid?.trim()
  if (dangling) {
    return `/find/westport/${encodeURIComponent(dangling)}`
  }
  if (vision?.candidates.length === 1) {
    const only = vision.candidates[0]
    const candidateHref = only?.parcelHref?.trim()
    if (candidateHref) return candidateHref
    const pid = only?.visionPid?.trim()
    if (pid && vision.town.trim().toLowerCase() === 'westport') {
      return `/find/westport/${encodeURIComponent(pid)}`
    }
  }
  return query ? findSearchHref(query) : null
}
