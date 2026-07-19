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
import { closeFieldsFromListing, compactHistoryEvents } from '@/lib/listing-history'
import { isClosedListing, isMarketListing } from '@/lib/listings-store'
import {
  DEFAULT_PRICING_MATCHING_CONFIG,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config-shared'
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
  vintageEdgeBuckets,
  vintageMatchesForComparable,
  type VintageBucketId,
} from '@/lib/vintage-buckets'

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
 * larger reservoir to build the look-back superset; If-estimates pass look-back
 * + admin match config.
 */
export type ComparablesRankOptions = {
  /** Trailing months for the sold/rented window. */
  soldLookbackMonths?: number
  /** Max sold/rented comps to keep. */
  soldLimit?: number
  /** Admin Pricing match tolerances (beds/baths/lot/sqft/vintage edge). */
  match?: PricingMatchingConfig
  /**
   * When true, accept any predefined vintage bucket (client filters the session
   * vintage set). Used for the interactive wide pool only.
   */
  relaxVintage?: boolean
}

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

/** Lot acreage tolerance when matching comparables (±40% by default). */
export const COMPARABLES_LOT_ACRE_TOLERANCE =
  DEFAULT_PRICING_MATCHING_CONFIG.lotAcreTolerance

function acreageWithinTolerance(
  subjectAcres: number,
  compAcres: number,
  match: PricingMatchingConfig,
): boolean {
  const min = subjectAcres * (1 - match.lotAcreTolerance)
  const max = subjectAcres * (1 + match.lotAcreTolerance)
  return compAcres >= min && compAcres <= max
}

/** Living-area tolerance when matching comparables (±30% by default). */
export const COMPARABLES_SQFT_TOLERANCE =
  DEFAULT_PRICING_MATCHING_CONFIG.sqftTolerance

function sqftWithinTolerance(
  subjectSqft: number,
  compSqft: number | null | undefined,
  match: PricingMatchingConfig,
): boolean {
  if (compSqft == null || compSqft <= 0) return false
  const min = subjectSqft * (1 - match.sqftTolerance)
  const max = subjectSqft * (1 + match.sqftTolerance)
  return compSqft >= min && compSqft <= max
}

/** Adjacent bed counts allowed when matching comparables. */
export const COMPARABLES_BED_TOLERANCE =
  DEFAULT_PRICING_MATCHING_CONFIG.bedTolerance

function bedsWithinTolerance(
  subjectBeds: number,
  compBeds: number | null | undefined,
  match: PricingMatchingConfig,
): boolean {
  if (compBeds == null) return false
  return Math.abs(compBeds - subjectBeds) <= match.bedTolerance
}

/** Adjacent bath counts allowed when matching comparables. */
export const COMPARABLES_BATH_TOLERANCE =
  DEFAULT_PRICING_MATCHING_CONFIG.bathTolerance

function bathsWithinTolerance(
  subjectBaths: number,
  compBaths: number | null | undefined,
  match: PricingMatchingConfig,
): boolean {
  if (compBaths == null) return false
  return Math.abs(compBaths - subjectBaths) <= match.bathTolerance
}

function resolveMatchConfig(
  options?: ComparablesRankOptions,
): PricingMatchingConfig {
  return options?.match ?? DEFAULT_PRICING_MATCHING_CONFIG
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
  match: PricingMatchingConfig = DEFAULT_PRICING_MATCHING_CONFIG,
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
    match.vintageEdgeFraction,
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
  match: PricingMatchingConfig,
  options?: Pick<ComparablesRankOptions, 'relaxVintage'>,
): boolean {
  if (isSameListing(comp, subject)) return false

  const compZip = normalizeZip(comp.address.postalCode)
  if (compZip !== criteria.zip) return false
  if (!bedsWithinTolerance(criteria.beds, comp.beds, match)) return false
  if (!bathsWithinTolerance(criteria.baths, comp.baths, match)) return false

  const compVintage = classifyYearBuilt(comp.yearBuilt)
  if (options?.relaxVintage) {
    if (criteria.vintageBucket === 'unknown' || compVintage === 'unknown') {
      if (criteria.vintageBucket !== compVintage) return false
    }
    // else: any predefined vintage is allowed in the wide pool
  } else if (
    !vintageMatchesForComparable(
      subject.yearBuilt,
      criteria.vintageBucket,
      compVintage,
      match.vintageEdgeFraction,
    )
  ) {
    return false
  }

  if (criteria.lotAcres != null && criteria.lotAcres > 0) {
    const compAcres = parseLotAcres(comp)
    if (compAcres == null || compAcres <= 0) return false
    if (!acreageWithinTolerance(criteria.lotAcres, compAcres, match)) {
      return false
    }
  }

  if (criteria.sqft != null && criteria.sqft > 0) {
    if (!sqftWithinTolerance(criteria.sqft, comp.sqft, match)) return false
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
  const match = resolveMatchConfig(options)
  const { criteria, missingCriteria } = subjectComparablesCriteria(
    subject,
    match,
  )

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
    matchesComparableCriteria(l, subject, criteria, match, options),
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
  options?: ComparablesRankOptions,
): ComparablesResult {
  const ranked = findComparablesRanked(
    subject,
    soldPool,
    activePool,
    mode,
    options,
  )
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
  options?: ComparablesRankOptions,
): ComparablesResult {
  return findComparables(subject, soldPool, activePool, 'rental', options)
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
    .map(({ listing, fitDistance }, index) => {
      const events = compactHistoryEvents(listing)
      return {
        listing: {
          ...buildComparableListing(listing),
          ...(events.length > 0 ? { historyEvents: events } : {}),
        },
        fitDistance,
        rank: index + 1,
      }
    })
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
  match: PricingMatchingConfig = DEFAULT_PRICING_MATCHING_CONFIG,
): RankedUagResult {
  const { criteria, missingCriteria } = subjectComparablesCriteria(
    subject,
    match,
  )

  if (!criteria) {
    return { sale: [], rental: [], criteria: null, missingCriteria }
  }

  const matches = underContractPool.filter((l) =>
    matchesComparableCriteria(l, subject, criteria, match),
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
