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

/** Rolling lookback window for rental comparable sold listings. */
const RENTAL_COMP_MONTHS = 8

function inRentalClosedPeriod(iso: string | null): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  const cutoff = Date.now() - RENTAL_COMP_MONTHS * 30.44 * 24 * 60 * 60 * 1000
  return t >= cutoff
}

/** True when a close timestamp falls within a trailing N-month window. */
function inTrailingMonths(iso: string | null, months: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  const cutoff = Date.now() - months * 30.44 * 24 * 60 * 60 * 1000
  return t >= cutoff
}

/**
 * Overrides for the sold/rented side of the ranking. Omitted → each mode keeps
 * its historical default (sale = calendar stats period, rental = 8-month roll,
 * limit = COMPARABLES_MATCH_LIMIT). The edge-cache path passes a wide window +
 * larger reservoir to build the look-back superset; If-estimates pass nothing.
 */
export type ComparablesRankOptions = {
  /** Trailing months for the sold/rented window. */
  soldLookbackMonths?: number
  /** Max sold/rented comps to keep. */
  soldLimit?: number
}
import { normalizeZip } from '@/lib/tmre-towns'
import {
  classifyYearBuilt,
  VINTAGE_BUCKETS,
  vintageBucketDistance,
  vintageEdgeBuckets,
  vintageMatchesForComparable,
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

/** Living-area tolerance when matching comparables (±30% of subject sqft). */
export const COMPARABLES_SQFT_TOLERANCE = 0.3

function sqftWithinTolerance(
  subjectSqft: number,
  compSqft: number | null | undefined,
): boolean {
  if (compSqft == null || compSqft <= 0) return false
  const min = subjectSqft * (1 - COMPARABLES_SQFT_TOLERANCE)
  const max = subjectSqft * (1 + COMPARABLES_SQFT_TOLERANCE)
  return compSqft >= min && compSqft <= max
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
  const vintageEdgeLabels = vintageEdgeBuckets(
    subject.yearBuilt,
    vintageBucket,
  ).map((id) => vintageLabel(id))

  return {
    criteria: {
      zip: zip!,
      beds: subject.beds!,
      baths: subject.baths!,
      lotAcres: subjectAcres != null && subjectAcres > 0 ? subjectAcres : null,
      sqft: subject.sqft != null && subject.sqft > 0 ? subject.sqft : null,
      vintageBucket,
      vintageLabel: vintageLabel(vintageBucket),
      ...(vintageEdgeLabels.length > 0 ? { vintageEdgeLabels } : {}),
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
  if (
    !vintageMatchesForComparable(
      subject.yearBuilt,
      criteria.vintageBucket,
      compVintage,
    )
  ) {
    return false
  }

  if (criteria.lotAcres != null && criteria.lotAcres > 0) {
    const compAcres = parseLotAcres(comp)
    if (compAcres == null || compAcres <= 0) return false
    if (!acreageWithinTolerance(criteria.lotAcres, compAcres)) return false
  }

  if (criteria.sqft != null && criteria.sqft > 0) {
    if (!sqftWithinTolerance(criteria.sqft, comp.sqft)) return false
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

  if (criteria.sqft != null && criteria.sqft > 0) {
    if (comp.sqft != null && comp.sqft > 0) {
      score += (Math.abs(comp.sqft - criteria.sqft) / criteria.sqft) * 40
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
  mode: ComparablesMatchMode,
  options?: ComparablesRankOptions,
): RankedComparable[] {
  const refPrice = subjectReferencePrice(subject)
  // Default: rental comps use a tighter rolling window; sale comps use the
  // broader calendar-year stats period. When a look-back is supplied (the
  // edge-cache superset path), use a plain trailing-months window instead.
  const inPeriod =
    options?.soldLookbackMonths != null
      ? (iso: string | null) =>
          inTrailingMonths(iso, options.soldLookbackMonths!)
      : mode === 'rental'
        ? inRentalClosedPeriod
        : inStatsClosedPeriod
  const limit = options?.soldLimit ?? COMPARABLES_MATCH_LIMIT

  return matches
    .filter((l) => isClosedListing(l))
    .map((l) => ({
      listing: l,
      closeTs: closedListingTimestamp(l),
      fitDistance: comparableFitDistance(l, subject, criteria),
    }))
    .filter(({ closeTs }) => inPeriod(closeTs))
    .sort((a, b) => {
      if (a.fitDistance !== b.fitDistance) return a.fitDistance - b.fitDistance

      const dateA = Date.parse(a.closeTs ?? '')
      const dateB = Date.parse(b.closeTs ?? '')
      if (dateB !== dateA) return dateB - dateA

      const priceA = closedSalePrice(a.listing)
      const priceB = closedSalePrice(b.listing)
      return priceDistance(refPrice, priceA) - priceDistance(refPrice, priceB)
    })
    .slice(0, limit)
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
  options?: ComparablesRankOptions,
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
    sold: rankSoldComps(matches, subject, criteria, mode, options),
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

// ---------------------------------------------------------------------------
// UAG (Under Agreement) — under-contract comps.
//
// Unlike sale/rental comparables (which split a pool into sold vs active), UAG
// works from a single pool of under-contract listings (SmartMLS "Under Contract"
// + "Under Contract - Continue to Show") and splits it into rental vs sale
// columns. Matching reuses the exact same criteria as comparables (zip, beds
// ±1, baths ±1, vintage era + edge rule, lot ±40%, living area ±30%).
// ---------------------------------------------------------------------------

/** Rank a pool of matched under-contract listings by fit, then price, then DOM. */
function rankUagComps(
  matches: Listing[],
  subject: Listing,
  criteria: ComparablesCriteria,
): RankedComparable[] {
  const refPrice = subjectReferencePrice(subject)

  return matches
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

export type RankedUagResult = {
  sale: RankedComparable[]
  rental: RankedComparable[]
  criteria: ComparablesCriteria | null
  missingCriteria: string[]
}

/**
 * Split a pool of under-contract listings into rental + sale UAG comps for the
 * subject. Caller supplies the already-fetched under-contract pool (typically
 * an on-demand RETS query scoped to the subject's zip).
 */
export function findUagRanked(
  subject: Listing,
  underContractPool: Listing[],
): RankedUagResult {
  const { criteria, missingCriteria } = subjectComparablesCriteria(subject)

  if (!criteria) {
    return { sale: [], rental: [], criteria: null, missingCriteria }
  }

  const matches = underContractPool.filter((l) =>
    matchesComparableCriteria(l, subject, criteria),
  )
  const rentals = matches.filter((l) => isRentalListing(l))
  const sales = matches.filter((l) => !isRentalListing(l))

  return {
    sale: rankUagComps(sales, subject, criteria),
    rental: rankUagComps(rentals, subject, criteria),
    criteria,
    missingCriteria: [],
  }
}
