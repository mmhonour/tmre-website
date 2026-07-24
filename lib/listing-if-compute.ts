import 'server-only'

import {
  findComparableRentals,
  findComparables,
} from '@/lib/listing-comparables'
import { readCachedComparables } from '@/lib/listing-comparables-cache'
import {
  COMPARABLES_MATCH_LIMIT,
  soldWithinLookback,
  type ComparablesResult,
} from '@/lib/listing-comparables-shared'
import {
  buildIfMatchParams,
  estimateFromComparables,
  ifLocationLabel,
  subjectVintageFromYear,
  type IfScenario,
  type ListingIfPayload,
} from '@/lib/listing-if-estimates'
import { computeLocationPremium } from '@/lib/listing-location-premium'
import {
  getPricingMatchingConfig,
  getPricingMatchingConfigFresh,
  pricingMatchingConfigFingerprint,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config'
import {
  VINTAGE_BUCKETS,
  type VintageBucketId,
} from '@/lib/vintage-buckets'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readAllListingsFromDb,
  upsertListingIfEstimate,
} from '@/lib/db/listings-repo'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, normalizeZip, townForZip } from '@/lib/tmre-towns'

/** Bump when valuation / payload shape changes so stale caches are ignored. */
export const IF_ESTIMATES_ALGO_VERSION = 9

const IF_DETAIL_TTL_MS = 12 * 60 * 60 * 1000

function ifDetailCacheKey(
  listingId: string,
  match: PricingMatchingConfig,
): string {
  return `if:detail:v${IF_ESTIMATES_ALGO_VERSION}:${listingId}:${pricingMatchingConfigFingerprint(match)}`
}

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

function isFresh(iso: string | null | undefined, ttlMs: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return Date.now() - t < ttlMs
}

function scenarioFromComparablesResult(
  kind: 'sale' | 'rent',
  comps: ComparablesResult,
  subject: Listing,
  match: PricingMatchingConfig,
  estimateContext: {
    subjectVintage: ReturnType<typeof subjectVintageFromYear>
    locationPremium: ReturnType<typeof computeLocationPremium>
  },
): IfScenario {
  const lookbackMonths = match.defaultLookbackMonths
  const sold = soldWithinLookback(
    comps.sold,
    lookbackMonths,
    COMPARABLES_MATCH_LIMIT,
  )
  const active = comps.active.slice(0, COMPARABLES_MATCH_LIMIT)
  const params = buildIfMatchParams(
    kind,
    comps.criteria,
    lookbackMonths,
    match,
  )
  const sqft = subject.sqft != null && subject.sqft > 0 ? subject.sqft : null
  return estimateFromComparables(
    sold,
    active,
    sqft,
    subjectMarketPrice(subject),
    estimateContext,
    kind,
    params,
    sold.length,
    active.length,
  )
}

function scenariosFromComparablesResults(
  subject: Listing,
  saleComps: ComparablesResult,
  rentComps: ComparablesResult,
  match: PricingMatchingConfig,
): {
  sale: IfScenario
  rent: IfScenario
  locationLabel: string | null
  locationPremiumLabels: string[]
  subjectVintageLabel: string | null
} {
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
    sale: scenarioFromComparablesResult(
      'sale',
      saleComps,
      subject,
      match,
      estimateContext,
    ),
    rent: scenarioFromComparablesResult(
      'rent',
      rentComps,
      subject,
      match,
      estimateContext,
    ),
    locationLabel,
    locationPremiumLabels: locationPremium.labels,
    subjectVintageLabel: vintageLabel(subjectVintage),
  }
}

function computeIfEstimates(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
  match: PricingMatchingConfig,
): {
  sale: IfScenario
  rent: IfScenario
  locationLabel: string | null
  locationPremiumLabels: string[]
  subjectVintageLabel: string | null
} {
  const lookbackMonths = match.defaultLookbackMonths
  const rankOpts = { soldLookbackMonths: lookbackMonths, match }
  const saleComps = findComparables(
    subject,
    soldPool,
    activePool,
    'sale',
    rankOpts,
  )
  const rentComps = findComparableRentals(
    subject,
    soldPool,
    activePool,
    rankOpts,
  )
  return scenariosFromComparablesResults(subject, saleComps, rentComps, match)
}

export async function cacheIfEstimatesForListing(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
): Promise<ListingIfPayload> {
  const id = listingRowId(subject)
  const match = await getPricingMatchingConfigFresh()
  const { sale, rent, locationLabel, locationPremiumLabels, subjectVintageLabel } =
    computeIfEstimates(subject, soldPool, activePool, match)
  const computedAt = new Date().toISOString()

  if (id) {
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
  }

  const payload: ListingIfPayload = {
    mlsId: subject.mlsId,
    sale,
    rent,
    computedAt,
    cached: true,
    locationLabel,
    locationPremiumLabels,
    subjectVintageLabel,
    subjectSqft: subject.sqft != null && subject.sqft > 0 ? subject.sqft : null,
  }

  if (id) {
    await writeStatsCacheRow(ifDetailCacheKey(id, match), payload).catch(
      () => undefined,
    )
  }
  setSyncMeta('if_estimates_algo_version', String(IF_ESTIMATES_ALGO_VERSION))
  return payload
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
  const id = listingRowId(listing)
  if (!id) return null

  // Version + match rules are already in the stats_cache key — don't also
  // require sync_meta `if_estimates_algo_version` (that gate forced full
  // town-pool recomputes whenever the in-process Map hadn't seen the key yet).
  const match = await getPricingMatchingConfigFresh()
  try {
    const row = await readStatsCacheRow(ifDetailCacheKey(id, match))
    if (!row || !isFresh(row.computedAt, IF_DETAIL_TTL_MS)) return null
    const parsed = JSON.parse(row.payload) as ListingIfPayload
    if (!parsed?.sale?.params || !parsed?.rent?.params) return null
    return { ...parsed, cached: true }
  } catch {
    return null
  }
}

/** Rebuild If estimates for all on-market listings after a RETS sync. */
export async function rebuildListingIfEstimates(): Promise<{ count: number }> {
  let count = 0
  const computedAt = new Date().toISOString()
  const match =
    (await getPricingMatchingConfigFresh().catch(() => null)) ??
    getPricingMatchingConfig()

  for (const town of TMRE_TOWNS) {
    const soldPool = await readAllListingsFromDb([town], 'Closed')
    const activePool = await readAllListingsFromDb([town], 'Active')

    for (const subject of activePool) {
      const id = listingRowId(subject)
      if (!id) continue
      const { sale, rent } = computeIfEstimates(
        subject,
        soldPool,
        activePool,
        match,
      )
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
      const payload: ListingIfPayload = {
        mlsId: subject.mlsId,
        sale,
        rent,
        computedAt,
        cached: true,
        locationLabel: ifLocationLabel(
          subject.address.city,
          normalizeZip(subject.address.postalCode),
        ),
        locationPremiumLabels: computeLocationPremium(
          subject.latitude,
          subject.longitude,
          subject.address.postalCode,
          subject.address.city,
        ).labels,
        subjectVintageLabel: vintageLabel(subjectVintageFromYear(subject.yearBuilt)),
        subjectSqft: subject.sqft != null && subject.sqft > 0 ? subject.sqft : null,
      }
      await writeStatsCacheRow(ifDetailCacheKey(id, match), payload).catch(
        () => undefined,
      )
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

async function persistIfPayload(
  listing: Listing,
  match: PricingMatchingConfig,
  parts: {
    sale: IfScenario
    rent: IfScenario
    locationLabel: string | null
    locationPremiumLabels: string[]
    subjectVintageLabel: string | null
  },
): Promise<ListingIfPayload> {
  const computedAt = new Date().toISOString()
  const id = listingRowId(listing)
  const payload: ListingIfPayload = {
    mlsId: listing.mlsId,
    sale: parts.sale,
    rent: parts.rent,
    computedAt,
    cached: true,
    locationLabel: parts.locationLabel,
    locationPremiumLabels: parts.locationPremiumLabels,
    subjectVintageLabel: parts.subjectVintageLabel,
    subjectSqft: listing.sqft != null && listing.sqft > 0 ? listing.sqft : null,
  }
  if (id) {
    await upsertListingIfEstimate({
      listingId: id,
      saleAmount: parts.sale.amount,
      saleAmountLow: parts.sale.amountLow,
      saleAmountHigh: parts.sale.amountHigh,
      saleSoldCount: parts.sale.soldCount,
      saleActiveCount: parts.sale.activeCount,
      rentAmount: parts.rent.amount,
      rentAmountLow: parts.rent.amountLow,
      rentAmountHigh: parts.rent.amountHigh,
      rentSoldCount: parts.rent.soldCount,
      rentActiveCount: parts.rent.activeCount,
      computedAt,
    }).catch(() => undefined)
    await writeStatsCacheRow(ifDetailCacheKey(id, match), payload).catch(
      () => undefined,
    )
  }
  setSyncMeta('if_estimates_algo_version', String(IF_ESTIMATES_ALGO_VERSION))
  return payload
}

export async function resolveListingIfPayload(
  listing: Listing,
): Promise<ListingIfPayload> {
  const cached = await readCachedListingIfPayload(listing)
  if (cached) return cached

  // Prefer warm Sales/Rentals edges — avoids loading every Closed+Active row
  // for the town when the matcher already ranked comps for this subject.
  const match = await getPricingMatchingConfigFresh()
  const [saleCached, rentCached] = await Promise.all([
    readCachedComparables(listing, 'sale'),
    readCachedComparables(listing, 'rental'),
  ])

  if (saleCached && rentCached) {
    return persistIfPayload(
      listing,
      match,
      scenariosFromComparablesResults(listing, saleCached, rentCached, match),
    )
  }

  // Partial edge hit: only load town pools for the missing side.
  if (saleCached || rentCached) {
    const { soldPool, activePool } = await compPoolsForListing(listing)
    const lookbackMonths = match.defaultLookbackMonths
    const rankOpts = { soldLookbackMonths: lookbackMonths, match }
    const saleComps =
      saleCached ??
      findComparables(listing, soldPool, activePool, 'sale', rankOpts)
    const rentComps =
      rentCached ??
      findComparableRentals(listing, soldPool, activePool, rankOpts)
    return persistIfPayload(
      listing,
      match,
      scenariosFromComparablesResults(listing, saleComps, rentComps, match),
    )
  }

  const { soldPool, activePool } = await compPoolsForListing(listing)
  return cacheIfEstimatesForListing(listing, soldPool, activePool)
}
