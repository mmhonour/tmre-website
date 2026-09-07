import {
  conditionsAreExact,
  conditionsAreSimilar,
  listingConditionRank,
  type ListingConditionGrade,
} from '@/lib/listing-condition'
import type { ComparableListing } from '@/lib/listing-comparables-shared'
import { withinLookbackMonths } from '@/lib/listing-comparables-shared'
import {
  townCenterOwningAt,
  type TownCenterPlacements,
} from '@/lib/location-estimate-town-centers-shared'
import {
  coastalStripLabel,
  type CoastalStripIndex,
} from '@/lib/location-estimate-zip-grid-shared'
import { streetsMatch } from '@/lib/listing-history'
import { normalizeParcelNumber } from '@/lib/property-address'
import {
  DEFAULT_PRICING_MATCHING_CONFIG,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config-shared'

/** What-if starts with this many sold/UAG comps (fill outward if a ring is short). */
export const IF_STRIP_SEARCH_MIN_COMPS = 3

/**
 * Strip-search What-if is only for a house sitting on a painted coastal
 * square. Unpainted and town-center-disk subjects keep the production path
 * (vintage + pin / village / golf). A strip painted *under* the disk is
 * stored for later, not used as the sale basis.
 */
export function usesCoastalStripWhatIf(
  coastalStrip: CoastalStripIndex | null | undefined,
  inTownCenter: boolean,
): boolean {
  return coastalStrip != null && !inTownCenter
}

/** Exact living-area band for matchFit (similar uses PricingMatchingConfig). */
export const IF_STRIP_EXACT_SQFT_TOLERANCE = 0.1

/** Temporary inland boost vs the subject strip (outward only). */
export const IF_STRIP_BOOST_ONE_STEP = 0.33
export const IF_STRIP_BOOST_TWO_STEPS = 0.5
export const IF_STRIP_BOOST_THREE_STEPS = 0.75
export const IF_STRIP_BOOST_TOWN = 1

export type StripSearchRing = CoastalStripIndex | 'town'
export type StripMatchFit = 'exact' | 'similar'

export type StripSearchSubject = {
  beds: number | null
  baths: number | null
  sqft: number | null
  conditionGrade?: ListingConditionGrade | null
  mlsId?: string | null
  listingKey?: string | null
}

export type StripSearchSelection = {
  ring: StripSearchRing
  ringLabel: string
  sold: ComparableListing[]
  underAgreement: ComparableListing[]
  comps: ComparableListing[]
}

function validPpsf(value: number | null | undefined): value is number {
  return value != null && value > 0 && Number.isFinite(value)
}

/**
 * Walk inland from the subject. The subject's own strip is skipped — other
 * houses painted the same number can sit anywhere along the coast, which is
 * not a short ring. 2nd-strip 772 therefore starts at 3rd → 4th → town
 * (915, 877, then 510), even when 2nd already has three distant sales.
 * Never look seaward.
 */
export function stripSearchRings(
  subjectStrip: CoastalStripIndex,
): StripSearchRing[] {
  const rings: StripSearchRing[] = []
  for (let strip = subjectStrip + 1; strip <= 3; strip += 1) {
    rings.push(strip as CoastalStripIndex)
  }
  rings.push('town')
  return rings
}

export function stripSearchRingLabel(ring: StripSearchRing): string {
  if (ring === 'town') return 'Rest of town'
  return coastalStripLabel(ring)
}

/**
 * Temporary PPSF boost when the winning ring is inland of the subject.
 * Never applied backward (a more-coastal comp is not a valid ring member).
 */
export function inlandStripBoostPct(
  subjectStrip: CoastalStripIndex,
  compRing: StripSearchRing,
): number {
  if (compRing === 'town') return IF_STRIP_BOOST_TOWN
  if (compRing < subjectStrip) return 0
  const steps = compRing - subjectStrip
  if (steps <= 0) return 0
  if (steps === 1) return IF_STRIP_BOOST_ONE_STEP
  if (steps === 2) return IF_STRIP_BOOST_TWO_STEPS
  return IF_STRIP_BOOST_THREE_STEPS
}

export function stampComparableTownCenter(
  comp: ComparableListing,
  placements: TownCenterPlacements = {},
): ComparableListing {
  if (comp.latitude == null || comp.longitude == null) {
    return { ...comp, inTownCenter: false }
  }
  return {
    ...comp,
    inTownCenter: townCenterOwningAt(comp.latitude, comp.longitude, placements) != null,
  }
}

function numericWithin(
  subject: number | null | undefined,
  comp: number | null | undefined,
  tolerance: number,
): boolean {
  if (subject == null || !Number.isFinite(subject)) return true
  if (comp == null || !Number.isFinite(comp)) return false
  return Math.abs(comp - subject) <= tolerance
}

function sqftWithin(
  subjectSqft: number | null | undefined,
  compSqft: number | null | undefined,
  fraction: number,
): boolean {
  if (subjectSqft == null || subjectSqft <= 0) return true
  if (compSqft == null || compSqft <= 0) return false
  const min = subjectSqft * (1 - fraction)
  const max = subjectSqft * (1 + fraction)
  return compSqft >= min && compSqft <= max
}

export function stripCompMatchesSubject(
  comp: ComparableListing,
  subject: StripSearchSubject,
  match: PricingMatchingConfig = DEFAULT_PRICING_MATCHING_CONFIG,
): boolean {
  if (subject.mlsId && comp.mlsId === subject.mlsId) return false
  if (subject.listingKey && comp.listingKey === subject.listingKey) return false
  if (!numericWithin(subject.beds, comp.beds, match.bedTolerance)) return false
  if (!numericWithin(subject.baths, comp.baths, match.bathTolerance)) return false
  if (!sqftWithin(subject.sqft, comp.sqft, match.sqftTolerance)) return false
  if (!conditionsAreSimilar(subject.conditionGrade, comp.conditionGrade)) {
    return false
  }
  return true
}

export function stripMatchFit(
  comp: ComparableListing,
  subject: StripSearchSubject,
): StripMatchFit {
  const bedsExact = subject.beds == null || comp.beds === subject.beds
  const bathsExact = subject.baths == null || comp.baths === subject.baths
  const sqftExact = sqftWithin(subject.sqft, comp.sqft, IF_STRIP_EXACT_SQFT_TOLERANCE)
  const conditionExact = !subject.conditionGrade
    ? true
    : conditionsAreExact(subject.conditionGrade, comp.conditionGrade)
  return bedsExact && bathsExact && sqftExact && conditionExact
    ? 'exact'
    : 'similar'
}

export function comparableStripRing(
  comp: ComparableListing,
  subjectStrip: CoastalStripIndex,
): StripSearchRing | null {
  if (comp.inTownCenter) return null
  const strip = comp.coastalStrip ?? null
  if (strip == null) return 'town'
  if (strip < subjectStrip) return null
  return strip
}

function isSoldInLookback(
  comp: ComparableListing,
  lookbackMonths: number,
  nowMs: number,
): boolean {
  return withinLookbackMonths(comp.closeDate, lookbackMonths, nowMs)
}

function eligibleStripCandidate(
  comp: ComparableListing,
  args: {
    subjectStrip: CoastalStripIndex
    subject: StripSearchSubject
    match: PricingMatchingConfig
    lookbackMonths: number
    nowMs: number
    allowUnderAgreement: boolean
  },
): boolean {
  if (!validPpsf(comp.pricePerSqft)) return false
  if (comparableStripRing(comp, args.subjectStrip) == null) return false
  if (!stripCompMatchesSubject(comp, args.subject, args.match)) return false
  if (args.allowUnderAgreement && comp.underAgreement) return true
  return isSoldInLookback(comp, args.lookbackMonths, args.nowMs)
}

function sameCity(a: ComparableListing, b: ComparableListing): boolean {
  const cityA = a.city?.trim().toLowerCase()
  const cityB = b.city?.trim().toLowerCase()
  return Boolean(cityA && cityB && cityA === cityB)
}

function sameProperty(a: ComparableListing, b: ComparableListing): boolean {
  const parcelA = normalizeParcelNumber(a.parcelNumber)
  const parcelB = normalizeParcelNumber(b.parcelNumber)
  if (parcelA && parcelB) return parcelA === parcelB
  return sameCity(a, b) && streetsMatch(a.address, b.address)
}

function closeDateMs(comp: ComparableListing): number {
  const ms = Date.parse(comp.closeDate ?? '')
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Same house can be sold and under agreement (or re-listed) in the same year.
 * A sold comp always wins over UAG/active at that parcel or address.
 */
export function preferSoldOverSameProperty(
  comps: readonly ComparableListing[],
): ComparableListing[] {
  const remaining = [...comps]
  const out: ComparableListing[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift()!
    const group = [seed]
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (!sameProperty(seed, remaining[i]!) && !group.some((g) => sameProperty(g, remaining[i]!))) {
        continue
      }
      group.push(remaining.splice(i, 1)[0]!)
    }
    const solds = group.filter((comp) => !comp.underAgreement)
    const pickFrom = solds.length > 0 ? solds : group
    pickFrom.sort((a, b) => closeDateMs(b) - closeDateMs(a))
    out.push(pickFrom[0]!)
  }
  return out
}

function stampSelectedComp(
  comp: ComparableListing,
  subjectStrip: CoastalStripIndex,
  ring: StripSearchRing,
  subject: StripSearchSubject,
): ComparableListing {
  const boostPct = inlandStripBoostPct(subjectStrip, ring)
  return {
    ...comp,
    stripBoostPct: boostPct,
    matchFit: stripMatchFit(comp, subject),
    stripSearchPick: true,
  }
}

/**
 * When a ring is short, fill from the next inland ring. Prefer the same
 * condition as the subject; a Fair house is a different class than Good.
 */
function conditionFillRank(
  subject: StripSearchSubject,
  comp: ComparableListing,
): number {
  const subjectRank = listingConditionRank(subject.conditionGrade)
  if (subjectRank == null) return 0
  const compRank = listingConditionRank(comp.conditionGrade)
  if (compRank == null) return 200
  if (compRank === subjectRank) return 0
  if (compRank < subjectRank) return 10 + (subjectRank - compRank)
  return 500 + (compRank - subjectRank)
}

function rankRingComps(
  comps: readonly ComparableListing[],
  subject: StripSearchSubject,
): ComparableListing[] {
  return [...comps].sort((a, b) => {
    const condition = conditionFillRank(subject, a) - conditionFillRank(subject, b)
    if (condition !== 0) return condition
    const soldRank = Number(Boolean(a.underAgreement)) - Number(Boolean(b.underAgreement))
    if (soldRank !== 0) return soldRank
    const fitA = stripMatchFit(a, subject) === 'exact' ? 0 : 1
    const fitB = stripMatchFit(b, subject) === 'exact' ? 0 : 1
    if (fitA !== fitB) return fitA - fitB
    return closeDateMs(b) - closeDateMs(a)
  })
}

function toSelection(
  comps: ComparableListing[],
  rings: StripSearchRing[],
): StripSearchSelection {
  const ring = rings[0] ?? 'town'
  const uniqueRings = [...new Set(rings)]
  return {
    ring,
    ringLabel: uniqueRings.map(stripSearchRingLabel).join(' + '),
    sold: comps.filter((comp) => !comp.underAgreement),
    underAgreement: comps.filter((comp) => Boolean(comp.underAgreement)),
    comps,
  }
}

/**
 * Walk inland from the next strip and pick 3 sold/UAG comps to start.
 * Keep a short ring and fill from the next inland ring — do not dump the
 * whole town pool or the subject's own strip. Never look seaward. Each
 * comp keeps its own inland boost versus the subject strip.
 */
export function selectStripSearchPool(args: {
  subjectStrip: CoastalStripIndex
  subject: StripSearchSubject
  sold: readonly ComparableListing[]
  underAgreement?: readonly ComparableListing[]
  match?: PricingMatchingConfig
  lookbackMonths?: number
  nowMs?: number
  townCenterPlacements?: TownCenterPlacements
}): StripSearchSelection | null {
  const match = args.match ?? DEFAULT_PRICING_MATCHING_CONFIG
  const lookbackMonths = args.lookbackMonths ?? 12
  const nowMs = args.nowMs ?? Date.now()
  const placements = args.townCenterPlacements ?? {}

  const pool = [...args.sold, ...(args.underAgreement ?? [])].map((comp) =>
    stampComparableTownCenter(comp, placements),
  )

  const eligible = preferSoldOverSameProperty(
    pool.filter((comp) =>
      eligibleStripCandidate(comp, {
        subjectStrip: args.subjectStrip,
        subject: args.subject,
        match,
        lookbackMonths,
        nowMs,
        allowUnderAgreement: true,
      }),
    ),
  )

  const picked: ComparableListing[] = []
  const usedRings: StripSearchRing[] = []
  for (const ring of stripSearchRings(args.subjectStrip)) {
    const inRing = eligible.filter(
      (comp) => comparableStripRing(comp, args.subjectStrip) === ring,
    )
    if (inRing.length === 0) continue
    const needed = IF_STRIP_SEARCH_MIN_COMPS - picked.length
    const take = rankRingComps(inRing, args.subject).slice(0, needed)
    picked.push(
      ...take.map((comp) =>
        stampSelectedComp(comp, args.subjectStrip, ring, args.subject),
      ),
    )
    usedRings.push(ring)
    if (picked.length >= IF_STRIP_SEARCH_MIN_COMPS) {
      return toSelection(picked, usedRings)
    }
  }
  return picked.length > 0 ? toSelection(picked, usedRings) : null
}
