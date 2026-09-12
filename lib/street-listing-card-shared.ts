/** Compact MLS row shown on /streets after a DB hit or a RETS ingest. */

export type StreetListingCard = {
  id: string
  mlsId: string | null
  status: string
  price: number | null
  closePrice?: number | null
  closeDate?: string | null
  street: string
  town: string
}

export function streetListingCardHref(card: Pick<StreetListingCard, 'id'>): string {
  return `/listings/${encodeURIComponent(card.id.trim())}`
}

export function formatStreetListingPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return ''
  return `$${Math.round(price).toLocaleString('en-US')}`
}

export function formatStreetListingLine(card: StreetListingCard): string {
  const price = formatStreetListingPrice(card.price)
  return [card.status.trim() || 'MLS', price].filter(Boolean).join(' · ')
}
