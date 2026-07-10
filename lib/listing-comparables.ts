import 'server-only'

import { parseLotAcres } from '@/lib/fixer-listings'
import { computeLocationPremium } from '@/lib/listing-location-premium'
import { isRentalListing } from '@/lib/listing-kind'
import {
  COMPARABLES_MATCH_LIMIT,
  type ComparableListing,
  type ComparablesCriteria,
  type ComparablesResult,
} from '@/lib/listing-comparables-shared'
import { closeFieldsFromListing } from '@/lib/listing-history'
import { isClosedListing, isMarketListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import {
  closedListingTimestamp,
  closedSalePrice,
  inStatsClosedPeriod,
} from '@/lib/stats-listing-rows'
import { normalizeZip } from '@/lib/tmre-towns'
import {
  classifyYearBuilt,
  VINTAGE_BUCKETS,
  vintageBucketDistance,
  vintageBucketsWithinTolerance,
  type VintageBucketId,
} from '@/lib/vintage-buckets'

export type {
  ComparableListing,
  ComparablesCriteria,
  ComparablesResult,
} from '@/lib/listing-comparables-shared'
export {
  fmtAcres,
  fmtPricePerSqft,
  fmtYearBuilt,
} from '@/lib/listing-comparables-shared'

function vintageLabel(id: VintageBucketId): string {
  if (id === 'unknown') return 'Unknown'
  return VINTAGE_BUCKETS.find((b) => b.id === id)?.label ?? id
}

function listingIdentity(l: Listing): string {
  return l.listingKey?.trim() || l.mlsId?.trim() || ''
}

function isSameListing(a: Listing, subject: Listing): boolean {
  const aId = listingIdentity(a)
  const sId = listingIdentity(subject)
  if (aId && sId && aId === sId) return true
  return a.mlsId === subject.mlsId
}

function subjectReferencePrice(subject: Listing): number | null {
  if (isClosedListing(subject)) {
    const sold = closedSalePrice(subject)
    if (sold != null) return sold
  }
  return subject.price != null && subject.price > 0 ? subject.price : null
}

function priceDistance(a: number | null, b: number | null): number {
  if (a == null || b == null || a <= 0 || b <= 0) return Number.POSITIVE_INFINITY
  return Math.abs(a - b)
}

/** Lot acreage tolerance when matching comparables (±40%). */
export const COMPARABLES_LOT_ACRE_TOLERANCE = 0.4

function acreageWithinTolerance(
  subjectAcres: number,
  compAcres: number,
): boolean {
  const min = subjectAcres * (1 - COMPARABLES_LOT_ACRE_TOLERANCE)
  const max = subjectAcres * (1 + COMPARABLES_LOT_ACRE_TOLERANCE)
  return compAcres >= min && compAcres <= max
}

/** Adjacent bed counts allowed when matching comparables. */
export const COMPARABLES_BED_TOLERANCE = 1

function bedsWithinTolerance(
  subjectBeds: number,
  compBeds: number | null | undefined,
): boolean {
  if (compBeds == null) return false
  return Math.abs(compBeds - subjectBeds) <= COMPARABLES_BED_TOLERANCE
}

/** Adjacent bath counts allowed when matching comparables. */
export const COMPARABLES_BATH_TOLERANCE = 1

function bathsWithinTolerance(
  subjectBaths: number,
  compBaths: number | null | undefined,
): boolean {
  if (compBaths == null) return false
  return Math.abs(compBaths - subjectBaths) <= COMPARABLES_BATH_TOLERANCE
}

export function buildComparableListing(l: Listing): ComparableListing {
  const { closeDate, closePrice } = closeFieldsFromListing(l)
  const lotAcres = parseLotAcres(l)
  const vintageBucket = classifyYearBuilt(l.yearBuilt)
  const street = l.address.street?.trim() || l.address.full?.trim() || '—'
  const soldPrice =
    closePrice != null && closePrice > 0
      ? closePrice
      : isClosedListing(l) && l.price != null && l.price > 0
        ? l.price
        : null
  const priceForPpsf =
    soldPrice ?? (l.price != null && l.price > 0 ? l.price : null)
  const pricePerSqft =
    priceForPpsf != null && l.sqft != null && l.sqft > 0
      ? priceForPpsf / l.sqft
      : null
  const locationPremium = computeLocationPremium(
    l.latitude,
    l.longitude,
    l.address.postalCode,
    l.address.city,
  )

  return {
    mlsId: l.mlsId,
    listingKey: l.listingKey,
    address: street,
    city: l.address.city?.trim() || null,
    zip: normalizeZip(l.address.postalCode),
    price: l.price != null && l.price > 0 ? l.price : null,
    closePrice: closePrice != null && closePrice > 0 ? closePrice : null,
    closeDate: closeDate ?? null,
    beds: l.beds,
    baths: l.baths,
    lotAcres,
    sqft: l.sqft != null && l.sqft > 0 ? l.sqft : null,
    vintageBucket,
    vintageLabel: vintageLabel(vintageBucket),
    yearBuilt: l.yearBuilt,
    pricePerSqft,
    dom: l.dom,
    photoCount: l.photoCount,
    latitude: l.latitude,
    longitude: l.longitude,
    locationPremiumMultiplier: locationPremium.combinedMultiplier,
  }
}

export function subjectComparablesCriteria(
  subject: Listing,
): { criteria: ComparablesCriteria | null; missingCriteria: string[] } {
  const zip = normalizeZip(subject.address.postalCode)
  const missingCriteria: string[] = []

  if (!zip) missingCriteria.push('zip code')
  if (subject.beds == null) missingCriteria.push('bedrooms')
  if (subject.baths == null) missingCriteria.push('bathrooms')

  if (missingCriteria.length > 0) {
    return { criteria: null, missingCriteria }
  }

  const subjectAcres = parseLotAcres(subject)
  const vintageBucket = classifyYearBuilt(subject.yearBuilt)

  return {
    criteria: {
      zip: zip!,
      beds: subject.beds!,
      baths: subject.baths!,
      lotAcres: subjectAcres != null && subjectAcres > 0 ? subjectAcres : null,
      vintageBucket,
      vintageLabel: vintageLabel(vintageBucket),
    },
    missingCriteria: [],
  }
}

export type ComparablesMatchMode = 'sale' | 'rental'

function filterPoolByMatchMode(
  pool: Listing[],
  mode: ComparablesMatchMode,
): Listing[] {
  return pool.filter((l) =>
    mode === 'rental' ? isRentalListing(l) : !isRentalListing(l),
  )
}

function matchesComparableCriteria(
  comp: Listing,
  subject: Listing,
  criteria: ComparablesCriteria,
): boolean {
  if (isSameListing(comp, subject)) return false

  const compZip = normalizeZip(comp.address.postalCode)
  if (compZip !== criteria.zip) return false
  if (!bedsWithinTolerance(criteria.beds, comp.beds)) return false
  if (!bathsWithinTolerance(criteria.baths, comp.baths)) return false

  const compVintage = classifyYearBuilt(comp.yearBuilt)
  if (!vintageBucketsWithinTolerance(criteria.vintageBucket, compVintage)) {
    return false
  }

  if (criteria.lotAcres != null && criteria.lotAcres > 0) {
    const compAcres = parseLotAcres(comp)
    if (compAcres == null || compAcres <= 0) return false
    if (!acreageWithinTolerance(criteria.lotAcres, compAcres)) return false
  }

  return true
}

/** Lower score = closer match to subject criteria. */
function comparableFitDistance(
  comp: Listing,
  subject: Listing,
  criteria: ComparablesCriteria,
): number {
  let score = 0

  if (comp.beds != null) {
    score += Math.abs(comp.beds - criteria.beds) * 100
  } else {
    score += 500
  }

  if (comp.baths != null) {
    score += Math.abs(comp.baths - criteria.baths) * 100
  } else {
    score += 500
  }

  const compVintage = classifyYearBuilt(comp.yearBuilt)
  score += vintageBucketDistance(criteria.vintageBucket, compVintage) * 50

  if (subject.yearBuilt != null && comp.yearBuilt != null) {
    score += Math.abs(comp.yearBuilt - subject.yearBuilt) * 0.25
  }

  if (criteria.lotAcres != null && criteria.lotAcres > 0) {
    const compAcres = parseLotAcres(comp)
    if (compAcres != null && compAcres > 0) {
      score +=
        (Math.abs(compAcres - criteria.lotAcres) / criteria.lotAcres) * 40
    } else {
      score += 40
    }
  }

  return score
}

export type RankedComparable = {
  listing: ComparableListing
  fitDistance: number
  rank: number
}

function rankSoldComps(
  matches: Listing[],
  subject: Listing,
  criteria: ComparablesCriteria,
): RankedComparable[] {
  const refPrice = subjectReferencePrice(subject)

  return matches
    .filter((l) => isClosedListing(l))
    .map((l) => ({
      listing: l,
      closeTs: closedListingTimestamp(l),
      fitDistance: comparableFitDistance(l, subject, criteria),
    }))
    .filter(({ closeTs }) => inStatsClosedPeriod(closeTs))
    .sort((a, b) => {
      if (a.fitDistance !== b.fitDistance) return a.fitDistance - b.fitDistance

      const dateA = Date.parse(a.closeTs ?? '')
      const dateB = Date.parse(b.closeTs ?? '')
      if (dateB !== dateA) return dateB - dateA

      const priceA = closedSalePrice(a.listing)
      const priceB = closedSalePrice(b.listing)
      return priceDistance(refPrice, priceA) - priceDistance(refPrice, priceB)
    })
    .slice(0, COMPARABLES_MATCH_LIMIT)
    .map(({ listing, fitDistance }, index) => ({
      listing: buildComparableListing(listing),
      fitDistance,
      rank: index + 1,
    }))
}

function rankActiveComps(
  matches: Listing[],
  subject: Listing,
  criteria: ComparablesCriteria,
): RankedComparable[] {
  const refPrice = subjectReferencePrice(subject)

  return matches
    .filter((l) => isMarketListing(l))
    .map((l) => ({
      listing: l,
      fitDistance: comparableFitDistance(l, subject, criteria),
    }))
    .sort((a, b) => {
      if (a.fitDistance !== b.fitDistance) return a.fitDistance - b.fitDistance

      const distA = priceDistance(refPrice, a.listing.price)
      const distB = priceDistance(refPrice, b.listing.price)
      if (distA !== distB) return distA - distB

      const domA = a.listing.dom ?? Number.POSITIVE_INFINITY
      const domB = b.listing.dom ?? Number.POSITIVE_INFINITY
      return domA - domB
    })
    .slice(0, COMPARABLES_MATCH_LIMIT)
    .map(({ listing, fitDistance }, index) => ({
      listing: buildComparableListing(listing),
      fitDistance,
      rank: index + 1,
    }))
}

export type RankedComparablesResult = {
  sold: RankedComparable[]
  active: RankedComparable[]
  criteria: ComparablesCriteria | null
  missingCriteria: string[]
}

export function findComparablesRanked(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
  mode: ComparablesMatchMode = 'sale',
): RankedComparablesResult {
  const { criteria, missingCriteria } = subjectComparablesCriteria(subject)

  if (!criteria) {
    return {
      sold: [],
      active: [],
      criteria: null,
      missingCriteria,
    }
  }

  const sold = filterPoolByMatchMode(soldPool, mode)
  const active = filterPoolByMatchMode(activePool, mode)
  const pool = [...sold, ...active]
  const matches = pool.filter((l) =>
    matchesComparableCriteria(l, subject, criteria),
  )

  return {
    sold: rankSoldComps(matches, subject, criteria),
    active: rankActiveComps(matches, subject, criteria),
    criteria,
    missingCriteria: [],
  }
}

export function findComparables(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
  mode: ComparablesMatchMode = 'sale',
): ComparablesResult {
  const ranked = findComparablesRanked(subject, soldPool, activePool, mode)
  return {
    sold: ranked.sold.map((row) => row.listing),
    active: ranked.active.map((row) => row.listing),
    criteria: ranked.criteria,
    missingCriteria: ranked.missingCriteria,
  }
}

export function findComparableRentals(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
): ComparablesResult {
  return findComparables(subject, soldPool, activePool, 'rental')
}
