import {
  closeFieldsFromListing,
  formatMlsStatus,
  primaryListingPrice,
} from '@/lib/listing-history'
import { isUnderContractStatus } from '@/lib/listing-status'
import {
  visionLastPaidSale,
  type VisionPaidSale,
} from '@/lib/vision-gis-parse'

export type { VisionPaidSale }

/** Closed MLS may record a few weeks before the assessor stamps the deed. */
export const VISION_DEED_DATE_SLACK_DAYS = 120
/** Close vs paid deed — 20% covers concessions, not a different sale. */
export const VISION_DEED_PRICE_SLACK = 0.2

export type VisionListingSaleRole = 'live' | 'deed' | 'closed' | 'prior'

export type VisionListingSaleInput = {
  status?: string | null
  price?: number | null
  statusChangeTimestamp?: string | null
  raw?: Record<string, string | null | undefined> | null
  closePrice?: number | null
  closeDate?: string | null
}

export function paidSaleFromVision(vision: {
  lastSaleDate?: string | null
  lastSalePrice?: number | null
  fieldCard?: { ownership?: Parameters<typeof visionLastPaidSale>[0]['ownership'] } | null
}): VisionPaidSale | null {
  return visionLastPaidSale({
    lastSaleDate: vision.lastSaleDate,
    lastSalePrice: vision.lastSalePrice,
    ownership: vision.fieldCard?.ownership,
  })
}

export function isLiveListingStatus(status: string | null | undefined): boolean {
  const label = formatMlsStatus(status).toLowerCase()
  if (label === 'active' || label === 'coming soon') return true
  return isUnderContractStatus(status)
}

function saleTimeMs(raw: string | null | undefined): number | null {
  const text = raw?.trim()
  if (!text) return null
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) {
    const [month, day, year] = text.split(/[^\d]/).map(Number)
    if (!month || !day || !year) return null
    const ms = Date.UTC(year, month - 1, day)
    return Number.isFinite(ms) ? ms : null
  }
  const ms = Date.parse(text.length <= 10 ? `${text}T00:00:00Z` : text)
  return Number.isFinite(ms) ? ms : null
}

function closeOf(listing: VisionListingSaleInput): {
  closeDate: string | null
  closePrice: number | null
} {
  if (listing.closeDate != null || listing.closePrice != null) {
    return {
      closeDate: listing.closeDate ?? null,
      closePrice:
        listing.closePrice != null && listing.closePrice > 0
          ? listing.closePrice
          : null,
    }
  }
  return closeFieldsFromListing({
    status: listing.status ?? '',
    price: listing.price ?? null,
    statusChangeTimestamp: listing.statusChangeTimestamp,
    raw: (listing.raw ?? null) as Record<string, string> | null,
  })
}

function datesAgree(closeDate: string | null, paidDate: string): boolean {
  const closeMs = saleTimeMs(closeDate)
  const paidMs = saleTimeMs(paidDate)
  if (closeMs == null || paidMs == null) return false
  return Math.abs(closeMs - paidMs) <= VISION_DEED_DATE_SLACK_DAYS * 86_400_000
}

function pricesAgree(closePrice: number | null, paidPrice: number): boolean {
  if (closePrice == null || closePrice <= 0 || paidPrice <= 0) return false
  const lo = Math.min(closePrice, paidPrice)
  const hi = Math.max(closePrice, paidPrice)
  return (hi - lo) / hi <= VISION_DEED_PRICE_SLACK
}

/**
 * A Closed MLS row is the Vision parcel's sale only when close date/price
 * meet the last paid deed. A 2016 land ask is not the 2017 house deed.
 * Live listings (Active / UC) stay the page listing regardless of the deed.
 */
export function visionListingSaleRole(
  listing: VisionListingSaleInput,
  paid: VisionPaidSale | null,
): VisionListingSaleRole {
  if (isLiveListingStatus(listing.status)) return 'live'
  const closed = formatMlsStatus(listing.status) === 'Closed'
  if (!closed) return paid ? 'prior' : 'closed'
  if (!paid) return 'closed'
  const { closeDate, closePrice } = closeOf(listing)
  if (pricesAgree(closePrice, paid.price)) return 'deed'
  if (datesAgree(closeDate, paid.date) && closePrice == null) return 'deed'
  return 'prior'
}

export function listingFitsVisionParcel(
  listing: VisionListingSaleInput,
  paid: VisionPaidSale | null,
): boolean {
  return visionListingSaleRole(listing, paid) !== 'prior'
}

/** Money the VGSI / Streets page may show from MLS — never a prior ask. */
export function visionParcelMlsPrice(
  listing: VisionListingSaleInput | null,
  paid: VisionPaidSale | null,
): number | null {
  if (!listing) return paid?.price ?? null
  const role = visionListingSaleRole(listing, paid)
  if (role === 'live') {
    return listing.price != null && listing.price > 0 ? listing.price : null
  }
  if (role === 'deed' || role === 'closed') {
    return primaryListingPrice({
      status: listing.status ?? '',
      price: listing.price ?? null,
      statusChangeTimestamp: listing.statusChangeTimestamp,
      raw: (listing.raw ?? null) as Record<string, string> | null,
    })
  }
  return paid?.price ?? null
}
