/**
 * Turn CAMA assessment extracts into per-listing annual tax rows.
 *
 * Two facts about Connecticut assessment do most of the work here:
 *
 *  - A parcel's assessment is frozen between town-wide revaluations. Westport's
 *    grand lists for 2021 through 2024 carry an identical figure for every
 *    parcel that did not physically change, so one observed assessment covers
 *    several years and only the mill rate moves.
 *  - `valuation_year` in an extract is the grand list the assessment belongs
 *    to, not the year OPM collected it. Towns file at different points in their
 *    revaluation cycle, so the 2025 collection holds 2025 values for Wilton and
 *    2021 values for Westport.
 *
 * So rather than assuming a vintage equals a year, each extract contributes an
 * *observation* of "this parcel was assessed at X for grand list year Y", and a
 * year with no observation of its own inherits the most recent earlier one.
 * Inheriting forwards is sound (the freeze); inheriting backwards is not, since
 * it would push post-revaluation values onto pre-revaluation years and inflate
 * the tax, so a year with no earlier observation is left unwritten instead.
 */

import type { CamaParcel } from '@/lib/ct-cama-source'
import {
  fiscalYearEndFor,
  grandListYearFor,
  isPlausibleAssessment,
} from '@/lib/ct-cama-source'
import { formatTaxYearLabel } from '@/lib/listing-property-tax'
import {
  addressMatchKey,
  addressMatchKeyLoose,
  normalizePropertyAddress,
} from '@/lib/property-address'

export type AssessmentOrigin = 'cama' | 'mls'

export type AssessmentObservation = {
  grandListYear: number
  assessedValue: number
  origin: AssessmentOrigin
  /** CAMA collection year the value was read from; absent for MLS. */
  vintage?: number
}

export type ParcelAssessments = {
  town: string
  /** Normalised street line this record is keyed by. */
  addressKey: string
  location: string | null
  /** Parcel ids seen for this address, newest vintage first. */
  pids: string[]
  /** Ascending by grand list year, one entry per year. */
  observations: AssessmentObservation[]
  /**
   * Two different parcels file under this street line, so which one a listing
   * refers to is unknowable from the extract. Excluded from matching rather
   * than resolved by coin flip.
   */
  ambiguous: boolean
}

export type CamaParcelIndex = {
  byAddress: Map<string, ParcelAssessments>
  byAddressLoose: Map<string, ParcelAssessments | null>
  /**
   * Parcel id to record, for towns whose ids survive between filings. An id
   * seen against more than one address maps to `null`, which is how the
   * renumbering towns drop out on their own.
   */
  byPid: Map<string, ParcelAssessments | null>
  stats: {
    records: number
    ambiguousRecords: number
    unstablePids: number
  }
}

function addressKeys(
  town: string,
  location: string | null,
): { exact: string; loose: string } | null {
  if (!location?.trim()) return null
  // Vacant land and paper streets are filed with no house number, which would
  // collapse every such parcel on a street onto one key.
  if (!/\d/.test(location)) return null
  const norm = normalizePropertyAddress(town, location)
  return { exact: addressMatchKey(norm), loose: addressMatchKeyLoose(norm) }
}

/**
 * How far a town's `valuation_year` label sits from the grand list it describes.
 *
 * Some towns label the extract with the collection year rather than the list
 * year, putting the label one ahead: Weston, New Canaan and Ridgefield all file
 * `2024 -> GL2024` when the assessments are the 2023 list. Others are honest
 * and vary genuinely (Wilton files `2022 -> GL2020`; Westport reports GL2021 in
 * all four collections), so the label cannot simply be overridden by a
 * constant.
 *
 * The error is invisible in most years — assessments are frozen between
 * revaluations, so shifting a flat series by a year changes nothing — and
 * surfaces only at the revaluation step, where it pairs the old assessment with
 * the new, lower mill rate and understates the bill by the whole revaluation
 * uplift. Measured, that was a median 13-30% error on one specific fiscal year
 * for three of six towns.
 *
 * So the offset is inferred from two signals the data already carries: the year
 * a town's assessments actually step up, and the year its mill rate falls
 * (which is on the true calendar, since the rate is published against the list
 * rather than the extract). Whichever shift best reconciles the two wins, and
 * ties or absent evidence keep the label as filed.
 */
const REVALUATION_ASSESSMENT_STEP = 1.08
const MIN_YEAR_SAMPLE = 50
const CANDIDATE_OFFSETS = [0, 1, -1] as const

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/** Labelled grand list years where the town's median assessment jumps. */
export function assessmentStepYears(parcels: readonly CamaParcel[]): number[] {
  const byYear = new Map<number, number[]>()
  for (const parcel of parcels) {
    if (parcel.grandListYear == null) continue
    if (!isPlausibleAssessment(parcel.assessedTotal)) continue
    const bucket = byYear.get(parcel.grandListYear)
    if (bucket) bucket.push(parcel.assessedTotal!)
    else byYear.set(parcel.grandListYear, [parcel.assessedTotal!])
  }

  const medians = [...byYear.entries()]
    .filter(([, values]) => values.length >= MIN_YEAR_SAMPLE)
    .map(([year, values]) => ({ year, value: median(values)! }))
    .sort((a, b) => a.year - b.year)

  const steps: number[] = []
  for (let i = 1; i < medians.length; i += 1) {
    const prev = medians[i - 1]!
    const curr = medians[i]!
    if (prev.value > 0 && curr.value / prev.value >= REVALUATION_ASSESSMENT_STEP) {
      steps.push(curr.year)
    }
  }
  return steps
}

export function inferValuationYearOffset(
  parcels: readonly CamaParcel[],
  revaluationYears: ReadonlySet<number>,
): number {
  const steps = assessmentStepYears(parcels)
  if (steps.length === 0 || revaluationYears.size === 0) return 0

  let best = { offset: 0, explained: -1 }
  for (const offset of CANDIDATE_OFFSETS) {
    const explained = steps.filter((year) =>
      revaluationYears.has(year - offset),
    ).length
    // Strict improvement only, and 0 is evaluated first, so a tie keeps the
    // label as filed.
    if (explained > best.explained) best = { offset, explained }
  }
  return best.explained > 0 ? best.offset : 0
}

/**
 * Fold every vintage's rows into one record per street address.
 *
 * The address is the key rather than the parcel id because it is the only
 * identifier the extracts agree on over time — see `CamaParcel.pid`. Keying on
 * the id instead splits one parcel into a separate record per filing, which
 * both loses the multi-year series the whole sync depends on and makes every
 * address look like it belongs to several parcels.
 *
 * Feed vintages newest first: where two collections report the same grand list
 * year, the fresher file wins, since a town that refiled has usually corrected
 * something.
 */
export function buildCamaParcelIndex(
  parcelsNewestVintageFirst: readonly CamaParcel[],
  options: {
    /**
     * Subtracted from every filed `valuation_year`. See
     * `inferValuationYearOffset` — pass its result rather than a guess.
     */
    valuationYearOffset?: number
  } = {},
): CamaParcelIndex {
  const valuationYearOffset = options.valuationYearOffset ?? 0

  // A town files one grand list year per extract, so a year carrying a handful
  // of rows out of thousands is a mislabelled record rather than a year the
  // town assessed. Westport has exactly one such row, and left alone it would
  // hand that single parcel a bogus observation instead of the carried-forward
  // value its neighbours get.
  const rowsPerYear = new Map<number, number>()
  for (const parcel of parcelsNewestVintageFirst) {
    if (parcel.grandListYear == null) continue
    if (!isPlausibleAssessment(parcel.assessedTotal)) continue
    const year = parcel.grandListYear - valuationYearOffset
    rowsPerYear.set(year, (rowsPerYear.get(year) ?? 0) + 1)
  }
  const byAddress = new Map<string, ParcelAssessments>()
  const byAddressLoose = new Map<string, ParcelAssessments | null>()
  const byPid = new Map<string, ParcelAssessments | null>()
  const looseKeyFor = new Map<string, string>()

  for (const parcel of parcelsNewestVintageFirst) {
    const keys = addressKeys(parcel.town, parcel.location)
    if (!keys) continue

    let record = byAddress.get(keys.exact)
    if (!record) {
      record = {
        town: parcel.town,
        addressKey: keys.exact,
        location: parcel.location,
        pids: [],
        observations: [],
        ambiguous: false,
      }
      byAddress.set(keys.exact, record)
      looseKeyFor.set(keys.exact, keys.loose)
    }
    record.location ??= parcel.location
    if (parcel.pid && !record.pids.includes(parcel.pid)) {
      record.pids.push(parcel.pid)
    }

    const { assessedTotal, vintage } = parcel
    if (parcel.grandListYear == null || !isPlausibleAssessment(assessedTotal)) {
      continue
    }
    const grandListYear = parcel.grandListYear - valuationYearOffset
    if ((rowsPerYear.get(grandListYear) ?? 0) < MIN_YEAR_SAMPLE) continue
    const existing = record.observations.find(
      (o) => o.grandListYear === grandListYear,
    )
    if (!existing) {
      record.observations.push({
        grandListYear,
        assessedValue: assessedTotal!,
        origin: 'cama',
        vintage,
      })
    } else if (
      existing.vintage === vintage &&
      existing.assessedValue !== assessedTotal
    ) {
      // Same filing, same address, same year, two different assessments: this
      // street line covers more than one parcel.
      record.ambiguous = true
    }
  }

  let ambiguousRecords = 0
  for (const record of byAddress.values()) {
    record.observations.sort((a, b) => a.grandListYear - b.grandListYear)
    if (record.ambiguous) ambiguousRecords += 1

    const looseKey = looseKeyFor.get(record.addressKey)
    if (looseKey) {
      if (!byAddressLoose.has(looseKey)) {
        byAddressLoose.set(looseKey, record)
      } else if (byAddressLoose.get(looseKey) !== record) {
        byAddressLoose.set(looseKey, null)
      }
    }

    for (const pid of record.pids) {
      if (!byPid.has(pid)) {
        byPid.set(pid, record)
      } else if (byPid.get(pid) !== record) {
        byPid.set(pid, null)
      }
    }
  }

  let unstablePids = 0
  for (const value of byPid.values()) {
    if (value === null) unstablePids += 1
  }

  return {
    byAddress,
    byAddressLoose,
    byPid,
    stats: { records: byAddress.size, ambiguousRecords, unstablePids },
  }
}

/**
 * Grand list years in which a town appears to have revalued, inferred from its
 * own mill rates.
 *
 * Carrying an assessment forward is only valid inside one revaluation cycle. A
 * revaluation resets every assessment, so a pre-revaluation figure carried past
 * one is not stale, it is wrong — and wrong in the expensive direction, since
 * these towns roughly doubled assessed values and cut the rate to match.
 *
 * There is no revaluation date in either dataset, but the mill rate gives it
 * away: budgets grow, so a town's rate drifts up a point or two a year, and a
 * real fall only happens when the grand list jumps. Across the observed towns
 * every revaluation shows a fall of 9% or more (Ridgefield -9.2%, New Canaan
 * -14.8%, Wilton -18.2%, Weston -29%, Westport -30%) while every ordinary year
 * is an increase, so the two are cleanly separable. The threshold sits below
 * the smallest observed fall with room to spare.
 *
 * A false positive here only withholds rows; it cannot invent one.
 */
const REVALUATION_MILL_RATE_DROP = 0.04

export function revaluationGrandListYears(
  millRates: ReadonlyMap<number, number>,
): Set<number> {
  const out = new Set<number>()
  for (const [fiscalYearEnd, rate] of millRates) {
    const prior = millRates.get(fiscalYearEnd - 1)
    if (prior == null || prior <= 0) continue
    if ((prior - rate) / prior >= REVALUATION_MILL_RATE_DROP) {
      out.add(grandListYearFor(fiscalYearEnd))
    }
  }
  return out
}

export type AssessmentInForce = {
  assessedValue: number
  /** Grand list year the value was actually observed for. */
  assessmentYear: number
  /** True when inherited from an earlier year under the revaluation freeze. */
  carriedForward: boolean
  origin: AssessmentOrigin
}

/**
 * Most recent observation at or before `grandListYear`, or null.
 *
 * `revaluationYears` blocks a carry-forward that would cross a revaluation.
 * Omit it only when the caller has already established that the span is inside
 * a single cycle.
 */
export function assessmentInForce(
  observations: readonly AssessmentObservation[],
  grandListYear: number,
  revaluationYears?: ReadonlySet<number>,
): AssessmentInForce | null {
  let best: AssessmentObservation | null = null
  for (const observation of observations) {
    if (observation.grandListYear > grandListYear) continue
    if (!best || observation.grandListYear > best.grandListYear) {
      best = observation
    }
  }
  if (!best) return null

  if (revaluationYears) {
    for (let year = best.grandListYear + 1; year <= grandListYear; year += 1) {
      if (revaluationYears.has(year)) return null
    }
  }

  return {
    assessedValue: best.assessedValue,
    assessmentYear: best.grandListYear,
    carriedForward: best.grandListYear !== grandListYear,
    origin: best.origin,
  }
}

/**
 * The fiscal years this sync is allowed to write.
 *
 * The current year is deliberately excluded: the MLS feed reports it directly
 * from `PropertyTax`, incremental sync re-upserts that row every half hour, and
 * a reported bill beats one derived from a mill rate the state has not
 * published yet. Four computed years plus the feed's one fills the five slots
 * the listing page renders.
 */
export function historicalFiscalYears(
  currentFiscalYearEnd: number,
  count = 4,
): number[] {
  return Array.from({ length: count }, (_, i) => currentFiscalYearEnd - 1 - i)
}

export type ListingParcelCandidate = {
  listingId: string
  town: string
  /** MLS `raw.ParcelNumber` — the key `listing_tax_history` is read by. */
  parcelNumber: string | null
  visionPid: string | null
  street: string | null
  /** MLS `raw.AssessedValue`, an extra observation where CAMA is stale. */
  assessedValue: number | null
  /** Fiscal year the MLS assessment belongs to, from `raw.TaxYear`. */
  taxYearEnd: number | null
}

export type MatchStrategy = 'vision_pid' | 'address' | 'address_loose'

export type ParcelMatch = {
  parcel: ParcelAssessments
  strategy: MatchStrategy
}

/**
 * Resolve a listing to a CAMA parcel.
 *
 * `vision_pid` is exact where it exists — it is the same identifier CAMA
 * publishes as `pid`, so no normalisation is involved. Only Westport is
 * crawled by the Vision sync today, so the other six towns fall back to the
 * shared street-address normaliser, then to the variant with a trailing street
 * type dropped for assessors who omit it.
 */
export function matchListingToParcel(
  listing: ListingParcelCandidate,
  index: CamaParcelIndex,
): ParcelMatch | null {
  const pid = listing.visionPid?.trim()
  if (pid) {
    const byPid = index.byPid.get(pid)
    if (byPid && !byPid.ambiguous) {
      return { parcel: byPid, strategy: 'vision_pid' }
    }
  }

  if (!listing.street?.trim()) return null
  const norm = normalizePropertyAddress(listing.town, listing.street)

  const exact = index.byAddress.get(addressMatchKey(norm))
  if (exact && !exact.ambiguous) return { parcel: exact, strategy: 'address' }

  const loose = index.byAddressLoose.get(addressMatchKeyLoose(norm))
  if (loose && !loose.ambiguous) return { parcel: loose, strategy: 'address_loose' }

  return null
}

export type ComputedTaxRow = {
  listingId: string
  parcelNumber: string
  town: string
  taxYearEnd: number
  taxYearLabel: string
  amount: number
  assessedValue: number
  assessmentYear: number
  assessmentCarriedForward: boolean
  millRate: number
}

export type ComputeSkipReason =
  | 'no_parcel_number'
  | 'no_mill_rate'
  | 'no_assessment'
  | 'assessment_across_revaluation'

export type ComputedTaxRowsForListing = {
  rows: ComputedTaxRow[]
  skipped: Partial<Record<ComputeSkipReason, number>>
}

/** `(assessment x mill rate) / 1000`, to the cent. */
export function taxFromAssessment(
  assessedValue: number,
  millRate: number,
): number {
  return Math.round((assessedValue * millRate) / 10) / 100
}

export function computeTaxRowsForListing(options: {
  listing: ListingParcelCandidate
  parcel: ParcelAssessments
  /** Fiscal year end -> town-proper mill rate. */
  millRates: ReadonlyMap<number, number>
  fiscalYears: readonly number[]
  /** Grand list years the town revalued in; see `revaluationGrandListYears`. */
  revaluationYears?: ReadonlySet<number>
}): ComputedTaxRowsForListing {
  const { listing, parcel, millRates, fiscalYears, revaluationYears } = options
  const skipped: Partial<Record<ComputeSkipReason, number>> = {}
  const bump = (reason: ComputeSkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  const parcelNumber = listing.parcelNumber?.trim()
  if (!parcelNumber) {
    bump('no_parcel_number')
    return { rows: [], skipped }
  }

  const observations = [...parcel.observations]
  // The MLS assessment is the current one, so it mostly matters for towns whose
  // filed extract lags a revaluation.
  if (listing.assessedValue != null && listing.taxYearEnd != null) {
    const grandListYear = grandListYearFor(listing.taxYearEnd)
    if (!observations.some((o) => o.grandListYear === grandListYear)) {
      observations.push({
        grandListYear,
        assessedValue: listing.assessedValue,
        origin: 'mls',
      })
      observations.sort((a, b) => a.grandListYear - b.grandListYear)
    }
  }

  const rows: ComputedTaxRow[] = []
  for (const taxYearEnd of fiscalYears) {
    const millRate = millRates.get(taxYearEnd)
    if (millRate == null) {
      bump('no_mill_rate')
      continue
    }
    const grandListYear = grandListYearFor(taxYearEnd)
    const assessment = assessmentInForce(
      observations,
      grandListYear,
      revaluationYears,
    )
    if (!assessment) {
      // Distinguish "nothing to work from" from "there is a value but using it
      // would cross a revaluation" — the second is a data-coverage gap worth
      // reporting separately, since a newer extract would close it.
      bump(
        assessmentInForce(observations, grandListYear)
          ? 'assessment_across_revaluation'
          : 'no_assessment',
      )
      continue
    }
    rows.push({
      listingId: listing.listingId,
      parcelNumber,
      town: listing.town,
      taxYearEnd,
      taxYearLabel: formatTaxYearLabel(taxYearEnd),
      amount: taxFromAssessment(assessment.assessedValue, millRate),
      assessedValue: assessment.assessedValue,
      assessmentYear: assessment.assessmentYear,
      assessmentCarriedForward: assessment.carriedForward,
      millRate,
    })
  }

  return { rows, skipped }
}

export { fiscalYearEndFor, grandListYearFor }
