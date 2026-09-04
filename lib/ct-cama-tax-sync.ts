import 'server-only'

/**
 * Backfill `listing_tax_history` from the CT Parcel & CAMA extracts.
 *
 * The MLS feed only ever reports the current fiscal year's tax, so four of the
 * five year slots the listing page renders are permanently null. This fills
 * them by pairing the assessor's published assessment for each parcel with the
 * town's mill rate for the matching fiscal year.
 *
 * Runs town by town: one pass over the mill rate table, then per town one
 * request per CAMA vintage and one read of that town's listings. Nothing is
 * fetched per listing, so the whole coverage area is a few dozen requests
 * rather than ~94,000 parcel page loads.
 */

import {
  CAMA_VINTAGES,
  fetchCamaParcels,
  fetchMillRates,
  indexMillRates,
  millRateTownIsSupported,
  millRateTownSkipReason,
  type CamaParcel,
} from '@/lib/ct-cama-source'
import {
  buildCamaParcelIndex,
  computeTaxRowsForListing,
  historicalFiscalYears,
  inferValuationYearOffset,
  matchListingToParcel,
  revaluationGrandListYears,
  type ComputedTaxRow,
  type ComputeSkipReason,
  type ListingParcelCandidate,
  type MatchStrategy,
} from '@/lib/ct-cama-tax-compute'
import {
  readListingParcelCandidates,
  readMlsOwnedTaxYearKeys,
  upsertComputedTaxHistory,
} from '@/lib/db/listing-tax-history-repo'
import { currentFiscalYearEnd } from '@/lib/listing-property-tax'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type CamaTaxTownResult = {
  town: string
  /** Set when the town was not processed; no other counts are meaningful. */
  skippedReason?: string
  camaParcels: number
  camaVintagesUsed: number[]
  listings: number
  matched: number
  unmatched: number
  matchStrategies: Record<MatchStrategy, number>
  fiscalYears: number[]
  fiscalYearsWithMillRate: number[]
  /** Grand list years the town appears to have revalued in. */
  revaluationYears: number[]
  /** Correction applied to the filed `valuation_year`; 0 means filed as-is. */
  valuationYearOffset: number
  rowsComputed: number
  rowsCarriedForward: number
  rowsDeferredToMls: number
  rowsWritten: number
  computeSkips: Partial<Record<ComputeSkipReason, number>>
  /** A few worked examples, for eyeballing a dry run. */
  samples: ComputedTaxRow[]
}

export type CamaTaxSyncResult = {
  startedAt: string
  finishedAt: string
  dryRun: boolean
  anchorFiscalYearEnd: number
  towns: CamaTaxTownResult[]
  rowsComputed: number
  rowsWritten: number
}

export type CamaTaxSyncOptions = {
  towns?: readonly string[]
  /** Compute and report without writing. */
  dryRun?: boolean
  /** Cap listings considered per town, for smoke tests. */
  limitPerTown?: number
  /** Number of historical fiscal years to fill. */
  years?: number
  /** Override "now" for the fiscal-year anchor. */
  anchorFiscalYearEnd?: number
  /** How many computed rows to keep per town for reporting. */
  sampleSize?: number
  /**
   * Injectable listing source. Supplying one means there is no database to
   * read, so the MLS-ownership check is skipped along with the write.
   */
  loadListings?: (town: string) => Promise<ListingParcelCandidate[]>
  onProgress?: (message: string) => void
}

const DEFAULT_SAMPLE_SIZE = 5

function emptyStrategyCounts(): Record<MatchStrategy, number> {
  return { vision_pid: 0, address: 0, address_loose: 0 }
}

/**
 * All vintages for one town, newest first, tolerating absent towns.
 *
 * The 2023 collection carries only New Canaan for this coverage area, and a
 * town that did not file simply returns no rows. That is not an error — the
 * timeline is built from whatever years did arrive.
 */
async function loadTownParcels(
  town: string,
  onProgress?: (message: string) => void,
): Promise<{ parcels: CamaParcel[]; vintagesUsed: number[] }> {
  const parcels: CamaParcel[] = []
  const vintagesUsed: number[] = []
  for (const vintage of CAMA_VINTAGES) {
    const rows = await fetchCamaParcels(vintage, town)
    if (rows.length === 0) {
      onProgress?.(`  ${town} ${vintage.vintage}: no rows filed`)
      continue
    }
    parcels.push(...rows)
    vintagesUsed.push(vintage.vintage)
    onProgress?.(`  ${town} ${vintage.vintage}: ${rows.length.toLocaleString()} parcels`)
  }
  return { parcels, vintagesUsed }
}

export async function syncCtCamaTaxHistory(
  options: CamaTaxSyncOptions = {},
): Promise<CamaTaxSyncResult> {
  const startedAt = new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const anchor = options.anchorFiscalYearEnd ?? currentFiscalYearEnd()
  const fiscalYears = historicalFiscalYears(anchor, options.years ?? 4)
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE
  const loadListings = options.loadListings ?? readListingParcelCandidates
  const hasDatabase = !options.loadListings
  const towns = options.towns?.length ? [...options.towns] : [...TMRE_TOWNS]
  const progress = options.onProgress

  const millRateRows = await fetchMillRates(towns)
  const millRatesByTown = indexMillRates(millRateRows)
  progress?.(
    `mill rates: ${millRateRows.length} town-year rows across ${millRatesByTown.size} towns`,
  )

  const results: CamaTaxTownResult[] = []
  let rowsComputedTotal = 0
  let rowsWrittenTotal = 0

  for (const town of towns) {
    if (!millRateTownIsSupported(town)) {
      const reason = millRateTownSkipReason(town) ?? 'unsupported mill rate'
      progress?.(`${town}: skipped — ${reason}`)
      results.push({
        town,
        skippedReason: reason,
        camaParcels: 0,
        camaVintagesUsed: [],
        listings: 0,
        matched: 0,
        unmatched: 0,
        matchStrategies: emptyStrategyCounts(),
        fiscalYears,
        fiscalYearsWithMillRate: [],
        revaluationYears: [],
        valuationYearOffset: 0,
        rowsComputed: 0,
        rowsCarriedForward: 0,
        rowsDeferredToMls: 0,
        rowsWritten: 0,
        computeSkips: {},
        samples: [],
      })
      continue
    }

    const millRates = millRatesByTown.get(town) ?? new Map<number, number>()
    const fiscalYearsWithMillRate = fiscalYears.filter((fy) => millRates.has(fy))
    if (fiscalYearsWithMillRate.length === 0) {
      const reason = `no published mill rate for FY${fiscalYears.join(', FY')}`
      progress?.(`${town}: skipped — ${reason}`)
      results.push({
        town,
        skippedReason: reason,
        camaParcels: 0,
        camaVintagesUsed: [],
        listings: 0,
        matched: 0,
        unmatched: 0,
        matchStrategies: emptyStrategyCounts(),
        fiscalYears,
        fiscalYearsWithMillRate,
        revaluationYears: [],
        valuationYearOffset: 0,
        rowsComputed: 0,
        rowsCarriedForward: 0,
        rowsDeferredToMls: 0,
        rowsWritten: 0,
        computeSkips: {},
        samples: [],
      })
      continue
    }

    const revaluationYears = revaluationGrandListYears(millRates)
    if (revaluationYears.size > 0) {
      progress?.(
        `${town}: revaluation inferred at grand list ${[...revaluationYears].sort().join(', ')}`,
      )
    }

    progress?.(`${town}: fetching CAMA vintages`)
    const { parcels, vintagesUsed } = await loadTownParcels(town, progress)
    const valuationYearOffset = inferValuationYearOffset(parcels, revaluationYears)
    if (valuationYearOffset !== 0) {
      progress?.(
        `${town}: valuation_year runs ${valuationYearOffset > 0 ? '+' : ''}${valuationYearOffset} ahead of the grand list it describes — correcting`,
      )
    }
    const index = buildCamaParcelIndex(parcels, { valuationYearOffset })

    const allListings = await loadListings(town)
    const listings =
      options.limitPerTown != null
        ? allListings.slice(0, options.limitPerTown)
        : allListings

    // Read on a dry run too. It is a read-only query, and skipping it made the
    // dry run over-report: every row an MLS figure already owns would have been
    // counted as one this sync was about to write.
    const mlsOwned = hasDatabase
      ? await readMlsOwnedTaxYearKeys(town)
      : new Set<string>()

    const matchStrategies = emptyStrategyCounts()
    const computeSkips: Partial<Record<ComputeSkipReason, number>> = {}
    const rows: ComputedTaxRow[] = []
    let matched = 0
    let carriedForward = 0
    let deferredToMls = 0

    for (const listing of listings) {
      const match = matchListingToParcel(listing, index)
      if (!match) continue
      matched += 1
      matchStrategies[match.strategy] += 1

      const computed = computeTaxRowsForListing({
        listing,
        parcel: match.parcel,
        millRates,
        fiscalYears,
        revaluationYears,
      })
      for (const [reason, count] of Object.entries(computed.skipped)) {
        const key = reason as ComputeSkipReason
        computeSkips[key] = (computeSkips[key] ?? 0) + (count ?? 0)
      }
      for (const row of computed.rows) {
        if (mlsOwned.has(`${row.parcelNumber}|${row.taxYearEnd}`)) {
          deferredToMls += 1
          continue
        }
        if (row.assessmentCarriedForward) carriedForward += 1
        rows.push(row)
      }
    }

    const rowsWritten = dryRun
      ? 0
      : await upsertComputedTaxHistory(rows, new Date())

    rowsComputedTotal += rows.length
    rowsWrittenTotal += rowsWritten
    progress?.(
      `${town}: ${matched.toLocaleString()}/${listings.length.toLocaleString()} listings matched, ` +
        `${rows.length.toLocaleString()} rows ${dryRun ? 'computed (dry run)' : 'written'}`,
    )

    results.push({
      town,
      camaParcels: index.byPid.size,
      camaVintagesUsed: vintagesUsed,
      listings: listings.length,
      matched,
      unmatched: listings.length - matched,
      matchStrategies,
      fiscalYears,
      fiscalYearsWithMillRate,
      revaluationYears: [...revaluationYears].sort((a, b) => a - b),
      valuationYearOffset,
      rowsComputed: rows.length,
      rowsCarriedForward: carriedForward,
      rowsDeferredToMls: deferredToMls,
      rowsWritten,
      computeSkips,
      samples: rows.slice(0, sampleSize),
    })
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    anchorFiscalYearEnd: anchor,
    towns: results,
    rowsComputed: rowsComputedTotal,
    rowsWritten: rowsWrittenTotal,
  }
}
