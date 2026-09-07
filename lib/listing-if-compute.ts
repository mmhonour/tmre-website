import 'server-only'

import {
  buildComparableListing,
  findComparableRentals,
  findComparables,
  stampComparableLocation,
  subjectComparablesCriteria,
} from '@/lib/listing-comparables'
import { readCachedComparables } from '@/lib/listing-comparables-cache'
import {
  COMPARABLES_MATCH_LIMIT,
  COMPARABLES_SOLD_SUPERSET_LIMIT,
  soldWithinLookback,
  withinLookbackMonths,
  type ComparableListing,
  type ComparablesResult,
} from '@/lib/listing-comparables-shared'
import { resolveListingCondition } from '@/lib/listing-condition'
import {
  buildIfMatchParams,
  estimateFromComparables,
  ifLocationLabel,
  subjectVintageFromYear,
  type IfScenario,
  type ListingIfPayload,
} from '@/lib/listing-if-estimates'
import {
  selectStripSearchPool,
  stripSearchRingLabel,
} from '@/lib/listing-if-strip-search'
import { computeLocationPremium } from '@/lib/listing-location-premium'
import { getLocationEstimateTownCentersFresh } from '@/lib/location-estimate-town-centers-config'
import type { TownCenterPlacements } from '@/lib/location-estimate-town-centers-shared'
import { getLocationEstimateZipGridFresh } from '@/lib/location-estimate-zip-grid-config'
import type { ZipGridCells } from '@/lib/location-estimate-zip-grid-shared'
import { isRentalListing } from '@/lib/listing-kind'
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
import { cacheLocationEstimateForListing } from '@/lib/listing-location-estimates-resolve'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { isClosedListing, isUnderContractListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, normalizeZip, townForZip } from '@/lib/tmre-towns'

/** Bump when valuation / payload shape changes so stale caches are ignored. */
export const IF_ESTIMATES_ALGO_VERSION = 15

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

async function loadWhatIfLocationCells(): Promise<ZipGridCells | undefined> {
  try {
    const grid = await getLocationEstimateZipGridFresh()
    return grid.cells
  } catch {
    return undefined
  }
}

async function loadTownCenterPlacements(): Promise<TownCenterPlacements> {
  try {
    const payload = await getLocationEstimateTownCentersFresh()
    return payload.placements
  } catch {
    return {}
  }
}

function buildStripSearchCandidates(
  soldPool: Listing[],
  activePool: Listing[],
  lookbackMonths: number,
  cells?: ZipGridCells,
): { sold: ComparableListing[]; underAgreement: ComparableListing[] } {
  const sold = soldPool
    .filter((listing) => !isRentalListing(listing) && isClosedListing(listing))
    .map((listing) => buildComparableListing(listing, { cells }))
    .filter((comp) => withinLookbackMonths(comp.closeDate, lookbackMonths))
  const underAgreement = activePool
    .filter(
      (listing) =>
        !isRentalListing(listing) && isUnderContractListing(listing),
    )
    .map((listing) => ({
      ...buildComparableListing(listing, { cells }),
      underAgreement: true,
    }))
  return { sold, underAgreement }
}

function paintedSaleScenario(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
  match: PricingMatchingConfig,
  estimateContext: {
    subjectVintage: ReturnType<typeof subjectVintageFromYear>
    locationPremium: ReturnType<typeof computeLocationPremium>
    subjectCondition: ReturnType<typeof resolveListingCondition>
  },
  cells: ZipGridCells | undefined,
  townCenters: TownCenterPlacements,
): IfScenario {
  const subjectStrip = estimateContext.locationPremium.coastalStrip
  const lookbackMonths = match.defaultLookbackMonths
  const { sold, underAgreement } = buildStripSearchCandidates(
    soldPool,
    activePool,
    lookbackMonths,
    cells,
  )
  const selected =
    subjectStrip != null
      ? selectStripSearchPool({
          subjectStrip,
          subject: {
            beds: subject.beds,
            baths: subject.baths,
            sqft: subject.sqft != null && subject.sqft > 0 ? subject.sqft : null,
            conditionGrade: estimateContext.subjectCondition,
            mlsId: subject.mlsId,
            listingKey: subject.listingKey,
          },
          sold,
          underAgreement,
          match,
          lookbackMonths,
          townCenterPlacements: townCenters,
        })
      : null
  const { criteria } = subjectComparablesCriteria(subject, match)
  const params = buildIfMatchParams('sale', criteria, lookbackMonths, match)
  const sqft = subject.sqft != null && subject.sqft > 0 ? subject.sqft : null
  return estimateFromComparables(
    selected?.sold ?? [],
    selected?.underAgreement ?? [],
    sqft,
    subjectMarketPrice(subject),
    {
      ...estimateContext,
      useStripSearchBasis: true,
      stripSearch:
        subjectStrip != null
          ? {
              subjectStrip,
              basisRing: selected?.ring ?? subjectStrip,
              basisLabel:
                selected?.ringLabel ?? stripSearchRingLabel(subjectStrip),
              foundCount: selected?.comps.length ?? 0,
            }
          : null,
    },
    'sale',
    params,
    selected?.sold.length ?? 0,
    selected?.underAgreement.length ?? 0,
  )
}

function applyGridToComparables(
  comps: ComparablesResult,
  cells: ZipGridCells | undefined,
): ComparablesResult {
  if (!cells) return comps
  return {
    ...comps,
    sold: comps.sold.map((comp) => stampComparableLocation(comp, cells)),
    active: comps.active.map((comp) => stampComparableLocation(comp, cells)),
  }
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
  const painted = estimateContext.locationPremium.coastalStrip != null
  const sold = soldWithinLookback(
    comps.sold,
    lookbackMonths,
    painted ? COMPARABLES_SOLD_SUPERSET_LIMIT : COMPARABLES_MATCH_LIMIT,
  )
  const active = comps.active.slice(
    0,
    painted ? COMPARABLES_SOLD_SUPERSET_LIMIT : COMPARABLES_MATCH_LIMIT,
  )
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
  cells?: ZipGridCells,
): {
  sale: IfScenario
  rent: IfScenario
  locationLabel: string | null
  locationPremiumLabels: string[]
  subjectVintageLabel: string | null
  subjectCondition: ReturnType<typeof resolveListingCondition>
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
    { cells },
  )
  const subjectVintage = subjectVintageFromYear(subject.yearBuilt)
  const subjectCondition = resolveListingCondition(subject)
  const estimateContext = {
    subjectVintage,
    locationPremium,
    subjectCondition,
  }
  const sale = applyGridToComparables(saleComps, cells)
  const rent = applyGridToComparables(rentComps, cells)

  return {
    sale: scenarioFromComparablesResult(
      'sale',
      sale,
      subject,
      match,
      estimateContext,
    ),
    rent: scenarioFromComparablesResult(
      'rent',
      rent,
      subject,
      match,
      estimateContext,
    ),
    locationLabel,
    locationPremiumLabels: locationPremium.labels,
    subjectVintageLabel: vintageLabel(subjectVintage),
    subjectCondition,
  }
}

function computeIfEstimates(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
  match: PricingMatchingConfig,
  cells?: ZipGridCells,
  townCenters: TownCenterPlacements = {},
): {
  sale: IfScenario
  rent: IfScenario
  locationLabel: string | null
  locationPremiumLabels: string[]
  subjectVintageLabel: string | null
  subjectCondition: ReturnType<typeof resolveListingCondition>
} {
  const lookbackMonths = match.defaultLookbackMonths
  const locationLabel = ifLocationLabel(
    subject.address.city,
    normalizeZip(subject.address.postalCode),
  )
  const locationPremium = computeLocationPremium(
    subject.latitude,
    subject.longitude,
    subject.address.postalCode,
    subject.address.city,
    { cells },
  )
  const subjectVintage = subjectVintageFromYear(subject.yearBuilt)
  const subjectCondition = resolveListingCondition(subject)
  const estimateContext = {
    subjectVintage,
    locationPremium,
    subjectCondition,
  }
  const rankOpts = {
    soldLookbackMonths: lookbackMonths,
    match,
    locationCells: cells,
  }
  const rentComps = applyGridToComparables(
    findComparableRentals(subject, soldPool, activePool, rankOpts),
    cells,
  )
  const rent = scenarioFromComparablesResult(
    'rent',
    rentComps,
    subject,
    match,
    estimateContext,
  )

  if (locationPremium.coastalStrip != null) {
    return {
      sale: paintedSaleScenario(
        subject,
        soldPool,
        activePool,
        match,
        estimateContext,
        cells,
        townCenters,
      ),
      rent,
      locationLabel,
      locationPremiumLabels: locationPremium.labels,
      subjectVintageLabel: vintageLabel(subjectVintage),
      subjectCondition,
    }
  }

  const saleComps = findComparables(
    subject,
    soldPool,
    activePool,
    'sale',
    rankOpts,
  )
  return {
    sale: scenarioFromComparablesResult(
      'sale',
      applyGridToComparables(saleComps, cells),
      subject,
      match,
      estimateContext,
    ),
    rent,
    locationLabel,
    locationPremiumLabels: locationPremium.labels,
    subjectVintageLabel: vintageLabel(subjectVintage),
    subjectCondition,
  }
}

export async function cacheIfEstimatesForListing(
  subject: Listing,
  soldPool: Listing[],
  activePool: Listing[],
): Promise<ListingIfPayload> {
  const id = listingRowId(subject)
  const match = await getPricingMatchingConfigFresh()
  const [cells, townCenters] = await Promise.all([
    loadWhatIfLocationCells(),
    loadTownCenterPlacements(),
  ])
  const {
    sale,
    rent,
    locationLabel,
    locationPremiumLabels,
    subjectVintageLabel,
    subjectCondition,
  } = computeIfEstimates(
    subject,
    soldPool,
    activePool,
    match,
    cells,
    townCenters,
  )
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
    subjectIsRental: isRentalListing(subject),
    subjectCondition,
  }

  if (id) {
    await writeStatsCacheRow(ifDetailCacheKey(id, match), payload).catch(
      () => undefined,
    )
    await cacheLocationEstimateForListing(subject, soldPool).catch(() => undefined)
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
  const [cells, townCenters] = await Promise.all([
    loadWhatIfLocationCells(),
    loadTownCenterPlacements(),
  ])

  for (const town of TMRE_TOWNS) {
    const soldPool = await readAllListingsFromDb([town], 'Closed')
    const activePool = await readAllListingsFromDb([town], 'Active')

    for (const subject of activePool) {
      const id = listingRowId(subject)
      if (!id) continue
      const { sale, rent, subjectCondition } = computeIfEstimates(
        subject,
        soldPool,
        activePool,
        match,
        cells,
        townCenters,
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
          { cells },
        ).labels,
        subjectVintageLabel: vintageLabel(subjectVintageFromYear(subject.yearBuilt)),
        subjectSqft: subject.sqft != null && subject.sqft > 0 ? subject.sqft : null,
        subjectIsRental: isRentalListing(subject),
        subjectCondition,
      }
      await writeStatsCacheRow(ifDetailCacheKey(id, match), payload).catch(
        () => undefined,
      )
      await cacheLocationEstimateForListing(subject, soldPool).catch(() => undefined)
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
    subjectCondition?: ReturnType<typeof resolveListingCondition>
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
    subjectIsRental: isRentalListing(listing),
    subjectCondition: parts.subjectCondition ?? resolveListingCondition(listing),
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
    await cacheLocationEstimateForListing(listing).catch(() => undefined)
  }
  setSyncMeta('if_estimates_algo_version', String(IF_ESTIMATES_ALGO_VERSION))
  return payload
}

export async function resolveListingIfPayload(
  listing: Listing,
): Promise<ListingIfPayload> {
  const cached = await readCachedListingIfPayload(listing)
  if (cached) {
    if (cached.subjectIsRental != null) return cached
    return { ...cached, subjectIsRental: isRentalListing(listing) }
  }

  // Prefer warm Sales/Rentals edges — avoids loading every Closed+Active row
  // for the town when the matcher already ranked comps for this subject.
  // Painted coastal subjects skip those edges: strip search needs the full
  // town sold + UAG pool, not the vintage-ranked Sales tab set.
  const match = await getPricingMatchingConfigFresh()
  const [saleCached, rentCached, cells] = await Promise.all([
    readCachedComparables(listing, 'sale'),
    readCachedComparables(listing, 'rental'),
    loadWhatIfLocationCells(),
  ])
  const painted =
    computeLocationPremium(
      listing.latitude,
      listing.longitude,
      listing.address.postalCode,
      listing.address.city,
      { cells },
    ).coastalStrip != null
  if (painted) {
    const { soldPool, activePool } = await compPoolsForListing(listing)
    return cacheIfEstimatesForListing(listing, soldPool, activePool)
  }

  if (saleCached && rentCached) {
    return persistIfPayload(
      listing,
      match,
      scenariosFromComparablesResults(
        listing,
        saleCached,
        rentCached,
        match,
        cells,
      ),
    )
  }

  // Partial edge hit: only load town pools for the missing side.
  if (saleCached || rentCached) {
    const { soldPool, activePool } = await compPoolsForListing(listing)
    const lookbackMonths = match.defaultLookbackMonths
    const rankOpts = {
      soldLookbackMonths: lookbackMonths,
      match,
      locationCells: cells,
    }
    const saleComps =
      saleCached ??
      findComparables(listing, soldPool, activePool, 'sale', rankOpts)
    const rentComps =
      rentCached ??
      findComparableRentals(listing, soldPool, activePool, rankOpts)
    return persistIfPayload(
      listing,
      match,
      scenariosFromComparablesResults(
        listing,
        saleComps,
        rentComps,
        match,
        cells,
      ),
    )
  }

  const { soldPool, activePool } = await compPoolsForListing(listing)
  return cacheIfEstimatesForListing(listing, soldPool, activePool)
}
