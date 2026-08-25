import 'server-only'

import {
  readDealOfTheDayBundle,
  type DealOfTheDayKind,
  type DealOfTheDayPropertyClass,
  type DealOfTheDayResponse,
} from '@/lib/deal-of-the-day-cache'
import type {
  DealCarouselDealsByTown,
  DealCarouselPayload,
  DealPropertyClassFilter,
} from '@/lib/deal-of-the-day-carousel-types'
import { listingIsFeaturedDealEligible } from '@/lib/listing-status'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type DealOfTheDayFssrSeed = {
  kind: DealOfTheDayKind
  propertyClass: DealOfTheDayPropertyClass
  dealsByTown: DealCarouselDealsByTown
  generatedAt: string
}

function featuredDealRawSignals(
  raw: { StandardStatus?: unknown; MLSStatus?: unknown } | null | undefined,
): Record<string, string> | null {
  if (!raw) return null
  const next: Record<string, string> = {}
  if (typeof raw.StandardStatus === 'string' && raw.StandardStatus.trim()) {
    next.StandardStatus = raw.StandardStatus
  }
  if (typeof raw.MLSStatus === 'string' && raw.MLSStatus.trim()) {
    next.MLSStatus = raw.MLSStatus
  }
  return Object.keys(next).length > 0 ? next : null
}

function toCarouselPayload(deal: DealOfTheDayResponse): DealCarouselPayload | null {
  const l = deal.listing
  if (!l?.mlsId && !l?.listingKey) return null
  if (!listingIsFeaturedDealEligible(l)) return null
  return {
    score: deal.score,
    photoUrl: deal.photoUrl ?? null,
    listing: {
      mlsId: l.mlsId,
      listingKey: l.listingKey,
      status: l.status,
      raw: featuredDealRawSignals(l.raw),
      propertyType: l.propertyType,
      style: l.style,
      address: {
        street: l.address.street,
        city: l.address.city,
        state: l.address.state,
        full: l.address.full,
      },
      price: l.price,
      originalListPrice: l.originalListPrice,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      yearBuilt: l.yearBuilt,
      dom: l.dom,
      listDate: l.listDate,
      photoCount: l.photoCount,
      schools: l.schools,
    },
    insight: deal.insight,
    totalReviewed: deal.totalReviewed,
    qualifiedCount: deal.qualifiedCount,
    kind: deal.kind,
    pricePerSqft: deal.pricePerSqft,
    cityMedianPricePerSqft: deal.cityMedianPricePerSqft,
    cityMedianPrice: deal.cityMedianPrice,
    valueDiscountPct: deal.valueDiscountPct,
    lotAcres: deal.lotAcres,
    superlatives: deal.superlatives,
    pickMode: deal.pickMode,
  }
}

/**
 * Server seed for DOTD carousel (default sale + homes).
 * Returns null when the 7×2×3 cache slice is empty — client falls back to API.
 */
export async function loadDealOfTheDayFssrSeed(
  kind: DealOfTheDayKind = 'sale',
  propertyClass: DealOfTheDayPropertyClass = 'homes',
): Promise<DealOfTheDayFssrSeed | null> {
  try {
    const bundled = await readDealOfTheDayBundle(kind, propertyClass)
    if (!bundled) return null

    const dealsByTown: DealCarouselDealsByTown = {}
    let any = false
    for (const town of TMRE_TOWNS) {
      const raw = bundled.deals[town as TmreTown]
      if (!raw) continue
      const mapped = toCarouselPayload(raw)
      if (!mapped) continue
      dealsByTown[town as TmreTown] = mapped
      any = true
    }
    if (!any) return null

    return {
      kind,
      propertyClass,
      dealsByTown,
      generatedAt: bundled.generatedAt,
    }
  } catch (err) {
    console.warn('[deal-of-the-day-fssr] seed load failed', err)
    return null
  }
}

export type { DealPropertyClassFilter }
