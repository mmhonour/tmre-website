import 'server-only'

import { findComparableRentals, findComparables } from '@/lib/listing-comparables'
import {
  estimateFromComparables,
  ifLocationLabel,
  subjectVintageFromYear,
  type IfEstimate,
  type ListingIfPayload,
} from '@/lib/listing-if-estimates'
import { computeLocationPremium } from '@/lib/listing-location-premium'
import {
  classifyYearBuilt,
  VINTAGE_BUCKETS,
  type VintageBucketId,
} from '@/lib/vintage-buckets'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readAllListingsFromDb,
  readListingIfEstimate,
  upsertListingIfEstimate,
  type ListingIfEstimateRow,
} from '@/lib/db/listings-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, normalizeZip, townForZip } from '@/lib/tmre-towns'

/** Bump when valuation logic changes so stale SQLite rows are ignored. */
export const IF_ESTIMATES_ALGO_VERSION = 5

function townsForSubject(subject: Listing): readonly string[] {
  const townFromZip = townForZip(subject.address.postalCode)
  return townFromZip ? [townFromZip] : [...TMRE_TOWNS]
}

function subjectMarketPrice(subject: Listing): number | null {
  if (isClosedListing(subject)) {
    const sold = closedSalePrice(subject)
    if (sold != null && sold > 0) return sold
  }
  return subject.price != null && subject.price > 0 ? subject.price : null
}

function vintageLabel(id: VintageBucketId): string | null {
  if (id === 'unknown') return null
  return VINTAGE_BUCKETS.find((b) => b.id === id)?.label ?? null
}

function computeIfEstimates(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
): {
  sale: IfEstimate
  rent: IfEstimate
  locationLabel: string | null
  locationPremiumLabels: string[]
  subjectVintageLabel: string | null
} {
  const saleComps = findComparables(subject, soldPool, activePool, 'sale')
  const rentComps = findComparableRentals(subject, soldPool, activePool)
  const sqft = subject.sqft != null && subject.sqft > 0 ? subject.sqft : null
  const salePrice = subjectMarketPrice(subject)
  const locationLabel = ifLocationLabel(
    subject.address.city,
    normalizeZip(subject.address.postalCode),
  )
  const locationPremium = computeLocationPremium(
    subject.latitude,
    subject.longitude,
    subject.address.postalCode,
    subject.address.city,
  )
  const subjectVintage = subjectVintageFromYear(subject.yearBuilt)
  const estimateContext = {
    subjectVintage,
    locationPremium,
  }
  return {
    sale: estimateFromComparables(
      saleComps.sold,
      saleComps.active,
      sqft,
      salePrice,
      estimateContext,
      'sale',
    ),
    rent: estimateFromComparables(
      rentComps.sold,
      rentComps.active,
      sqft,
      salePrice,
      estimateContext,
      'rent',
    ),
    locationLabel,
    locationPremiumLabels: locationPremium.labels,
    subjectVintageLabel: vintageLabel(subjectVintage),
  }
}

function rowToPayload(
  mlsId: string,
  row: ListingIfEstimateRow,
  locationLabel: string | null,
  locationPremiumLabels: string[] = [],
  subjectVintageLabel: string | null = null,
): ListingIfPayload {
  return {
    mlsId,
    sale: {
      amount: row.saleAmount,
      amountLow: row.saleAmountLow,
      amountHigh: row.saleAmountHigh,
      soldCount: row.saleSoldCount,
      activeCount: row.saleActiveCount,
    },
    rent: {
      amount: row.rentAmount,
      amountLow: row.rentAmountLow,
      amountHigh: row.rentAmountHigh,
      soldCount: row.rentSoldCount,
      activeCount: row.rentActiveCount,
    },
    computedAt: row.computedAt,
    cached: true,
    locationLabel,
    locationPremiumLabels,
    subjectVintageLabel,
  }
}

export async function cacheIfEstimatesForListing(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
): Promise<ListingIfPayload> {
  const id = listingRowId(subject)
  const { sale, rent, locationLabel, locationPremiumLabels, subjectVintageLabel } =
    computeIfEstimates(subject, soldPool, activePool)
  const computedAt = new Date().toISOString()
  await upsertListingIfEstimate({
    listingId: id,
    saleAmount: sale.amount,
    saleAmountLow: sale.amountLow,
    saleAmountHigh: sale.amountHigh,
    saleSoldCount: sale.soldCount,
    saleActiveCount: sale.activeCount,
    rentAmount: rent.amount,
    rentAmountLow: rent.amountLow,
    rentAmountHigh: rent.amountHigh,
    rentSoldCount: rent.soldCount,
    rentActiveCount: rent.activeCount,
    computedAt,
  })
  setSyncMeta('if_estimates_algo_version', String(IF_ESTIMATES_ALGO_VERSION))
  return {
    mlsId: subject.mlsId,
    sale,
    rent,
    computedAt,
    cached: true,
    locationLabel,
    locationPremiumLabels,
    subjectVintageLabel,
  }
}
export async function refreshListingIfEstimate(
  subject: Listing,
): Promise<ListingIfPayload | null> {
  const id = listingRowId(subject)
  if (!id) return null
  const towns = townsForSubject(subject)
  const soldPool = await readAllListingsFromDb(towns, 'Closed')
  const activePool = await readAllListingsFromDb(towns, 'Active')
  return cacheIfEstimatesForListing(subject, soldPool, activePool)
}

export async function readCachedListingIfPayload(
  listing: Listing,
): Promise<ListingIfPayload | null> {
  const cachedVersion = getSyncMeta('if_estimates_algo_version')
  if (cachedVersion !== String(IF_ESTIMATES_ALGO_VERSION)) return null

  const row = await readListingIfEstimate(listingRowId(listing))
  if (!row) return null

  const saleRangeMissing =
    row.saleAmount != null &&
    (row.saleAmountLow == null || row.saleAmountHigh == null)
  const rentRangeMissing =
    row.rentAmount != null &&
    (row.rentAmountLow == null || row.rentAmountHigh == null)
  if (saleRangeMissing || rentRangeMissing) return null

  return rowToPayload(
    listing.mlsId,
    row,
    ifLocationLabel(listing.address.city, normalizeZip(listing.address.postalCode)),
    computeLocationPremium(
      listing.latitude,
      listing.longitude,
      listing.address.postalCode,
      listing.address.city,
    ).labels,
    vintageLabel(subjectVintageFromYear(listing.yearBuilt)),
  )
}

/** Rebuild If estimates for all on-market listings after a RETS sync. */
export async function rebuildListingIfEstimates(): Promise<{ count: number }> {
  let count = 0
  const computedAt = new Date().toISOString()

  for (const town of TMRE_TOWNS) {
    const soldPool = await readAllListingsFromDb([town], 'Closed')
    const activePool = await readAllListingsFromDb([town], 'Active')

    for (const subject of activePool) {
      const id = listingRowId(subject)
      if (!id) continue
      const { sale, rent } = computeIfEstimates(subject, soldPool, activePool)
      await upsertListingIfEstimate({
        listingId: id,
        saleAmount: sale.amount,
        saleAmountLow: sale.amountLow,
        saleAmountHigh: sale.amountHigh,
        saleSoldCount: sale.soldCount,
        saleActiveCount: sale.activeCount,
        rentAmount: rent.amount,
        rentAmountLow: rent.amountLow,
        rentAmountHigh: rent.amountHigh,
        rentSoldCount: rent.soldCount,
        rentActiveCount: rent.activeCount,
        computedAt,
      })
      count += 1
    }
  }

  setSyncMeta('last_if_estimates_cache', computedAt)
  setSyncMeta('if_estimates_algo_version', String(IF_ESTIMATES_ALGO_VERSION))
  console.info(`[listing-if-cache] rebuilt ${count} If estimates`)
  return { count }
}

async function compPoolsForListing(listing: Listing): Promise<{
  soldPool: Listing[]
  activePool: Listing[]
}> {
  const towns = townsForSubject(listing)
  const [soldPool, activePool] = await Promise.all([
    readAllListingsFromDb(towns, 'Closed'),
    readAllListingsFromDb(towns, 'Active'),
  ])
  return { soldPool, activePool }
}

export async function resolveListingIfPayload(
  listing: Listing,
): Promise<ListingIfPayload> {
  const cached = await readCachedListingIfPayload(listing)
  if (cached) return cached
  const { soldPool, activePool } = await compPoolsForListing(listing)
  return cacheIfEstimatesForListing(listing, soldPool, activePool)
}
