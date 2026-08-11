/**
 * Recount Intelligence mini-graph buckets from the deal-board listing pool
 * so point counts match what a click would produce under current filters.
 */

export type MiniGraphPriceListing = {
  price: number | null | undefined
}

export type MiniGraphDomListing = {
  dom: number | null | undefined
}

export type MiniGraphPriceBandDef = {
  id: string
  label: string
  min: number
  max: number | null
}

export type MiniGraphDomBandDef = {
  id: string
  label: string
  shortLabel?: string
  minDays: number
  maxDays: number | null
}

function priceInBand(
  price: number | null | undefined,
  min: number,
  max: number | null,
): boolean {
  if (price == null || !Number.isFinite(price) || price < 0) return false
  if (price < min) return false
  if (max != null && price > max) return false
  return true
}

function domInBand(
  dom: number | null | undefined,
  minDays: number,
  maxDays: number | null,
): boolean {
  if (dom == null || !Number.isFinite(dom) || dom < 0) return false
  const days = Math.round(dom)
  if (days < minDays) return false
  if (maxDays == null) return true
  return days <= maxDays
}

/** Recount price bands from listings (band defs from Admin / API skeleton). */
export function recountPriceBandsFromListings<T extends MiniGraphPriceBandDef>(
  bandDefs: readonly T[],
  listings: readonly MiniGraphPriceListing[],
): Array<T & { count: number }> {
  return bandDefs.map((b) => ({
    ...b,
    count: listings.reduce(
      (n, l) => (priceInBand(l.price, b.min, b.max) ? n + 1 : n),
      0,
    ),
  }))
}

/** Recount DOM day-bands from listings. */
export function recountDomBandsFromListings<T extends MiniGraphDomBandDef>(
  bandDefs: readonly T[],
  listings: readonly MiniGraphDomListing[],
): Array<T & { count: number }> {
  return bandDefs.map((b) => ({
    ...b,
    count: listings.reduce(
      (n, l) => (domInBand(l.dom, b.minDays, b.maxDays) ? n + 1 : n),
      0,
    ),
  }))
}
