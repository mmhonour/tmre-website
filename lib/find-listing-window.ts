import {
  visionPurchaseDate,
  yearFromVisionDate,
  type VisionOwnershipRow,
} from '@/lib/vision-gis-parse'

/**
 * Closed RETS window around a Vision last-deed date.
 *
 * SmartMLS will not return old Closed rows on an address-only search — it
 * needs a StatusChangeTimestamp range (same reason bulk closed sync uses
 * year windows). A 2018 sale is outside CLOSED_LISTINGS_SINCE (2019), so
 * Find has to ask for that year explicitly.
 *
 * VGSI writes `09/12/2016`, not ISO. Use {@link yearFromVisionDate} so the
 * year is not dropped and the search does not fall back to 2000–today.
 */
export function closedSearchWindowForSaleDate(
  lastSaleDate: string | null | undefined,
  now = new Date(),
): { closedAfter: string; closedBefore: string } {
  const today = now.toISOString().slice(0, 10)
  const year = yearFromVisionDate(lastSaleDate)
  if (year != null && year >= 1990 && year <= 2100) {
    return {
      closedAfter: `${year - 1}-01-01`,
      closedBefore: `${Math.min(year + 1, now.getUTCFullYear() + 1)}-12-31`,
    }
  }
  return { closedAfter: '2000-01-01', closedBefore: today }
}

/**
 * Deed date for the Closed RETS window. Prefer the last paid purchase —
 * Vision `last_sale_date` is often a later $0 quitclaim (5384: 2016 QC,
 * paid sale 2014). Falling back to the card date still parses MM/DD/YYYY.
 */
export function closedSearchDateForVision(vision: {
  lastSaleDate?: string | null
  lastSalePrice?: number | null
  fieldCard?: { ownership?: readonly VisionOwnershipRow[] } | null
}): string | null {
  return (
    visionPurchaseDate({
      lastSaleDate: vision.lastSaleDate,
      lastSalePrice: vision.lastSalePrice,
      ownership: vision.fieldCard?.ownership,
    }) ??
    vision.lastSaleDate ??
    null
  )
}
