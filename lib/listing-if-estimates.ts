import type {
  ComparableListing,
  ComparablesCriteria,
} from '@/lib/listing-comparables-shared'
import {
  COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
  lookbackLabel,
} from '@/lib/listing-comparables-shared'
import type { ListingFurnished } from '@/lib/listing-furnished'
import {
  formatLocationPremiumLabels,
  type LocationPremiumFactors,
} from '@/lib/listing-location-premium'
import {
  DEFAULT_PRICING_MATCHING_CONFIG,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config-shared'
import {
  classifyYearBuilt,
  vintageBucketDistance,
  type VintageBucketId,
} from '@/lib/vintage-buckets'
import type { InventorySegmentBandsConfig } from '@/lib/inventory-segment-bands-shared'

const TOP_COMP_COUNT = 8
/** Keep comps in the same location/price tier as the subject ($/sqft band). */
const SUBJECT_PPSF_BAND = 0.4
const SOLD_PPSF_WEIGHT = 0.55
const ACTIVE_PPSF_WEIGHT = 0.45
/** Comp spread band for If low/high range (weighted 25th–75th percentile). */
const RANGE_LOW_PERCENTILE = 0.25
const RANGE_HIGH_PERCENTILE = 0.75
const MIN_SALE_RANGE_SPREAD = 10_000
const MIN_RENT_RANGE_SPREAD = 200
const SINGLE_COMP_RANGE_PAD = 0.05

/** Vintage factor in `compWeight` — keep explain copy in sync. */
export const IF_VINTAGE_WEIGHT_SAME = 4
export const IF_VINTAGE_WEIGHT_ADJACENT = 1.75
export const IF_VINTAGE_WEIGHT_FAR = 0.5

/** Location-premium |subject − comp| tiers → multipliers in `compWeight`. */
export const IF_LOCATION_PREMIUM_TIER_1 = 0.02
export const IF_LOCATION_PREMIUM_TIER_2 = 0.05
export const IF_LOCATION_PREMIUM_TIER_3 = 0.1
export const IF_LOCATION_WEIGHT_TIER_1 = 2.5
export const IF_LOCATION_WEIGHT_TIER_2 = 1.6
export const IF_LOCATION_WEIGHT_TIER_3 = 1.2
export const IF_LOCATION_WEIGHT_FAR = 0.85

/** Midpoint $/sqft (or price) aggregations — all three are cached on each scenario. */
export const IF_MIDPOINT_METHODS = [
  'median',
  'average',
  'weightedAverage',
] as const
export type IfMidpointMethod = (typeof IF_MIDPOINT_METHODS)[number]

/** Default What if midpoint — median; average / weighted avg stay available in cache. */
export const IF_DEFAULT_MIDPOINT_METHOD: IfMidpointMethod = 'median'

export const IF_MIDPOINT_METHOD_LABELS: Record<IfMidpointMethod, string> = {
  median: 'Median',
  average: 'Average',
  weightedAverage: 'Weighted avg',
}

export type IfMidpointVariant = {
  amount: number | null
  blendedPpsf: number | null
}

export type IfMidpointAggregates = Record<IfMidpointMethod, IfMidpointVariant>

export function emptyMidpointAggregates(): IfMidpointAggregates {
  const blank: IfMidpointVariant = { amount: null, blendedPpsf: null }
  return {
    median: { ...blank },
    average: { ...blank },
    weightedAverage: { ...blank },
  }
}

/**
 * Plain-language explanation of the per-comp `wt` shown on What if.
 * Formula: wt = vintageWeight × locationPremiumWeight.
 */
export function ifCompWeightExplainLines(): string[] {
  return [
    'wt is the weight each comparable gets when you pick Weighted avg for the What if midpoint. Higher wt pulls that average more toward that property. Median and Average ignore wt.',
    'wt = vintage factor × location-tier factor.',
    `Vintage factor: same era ×${IF_VINTAGE_WEIGHT_SAME}, neighboring era ×${IF_VINTAGE_WEIGHT_ADJACENT}, farther eras ×${IF_VINTAGE_WEIGHT_FAR}. If this home’s vintage is unknown, every comp uses ×1.`,
    `Location-tier factor: compare this home’s location-premium multiplier to the comp’s. Difference ≤${IF_LOCATION_PREMIUM_TIER_1} → ×${IF_LOCATION_WEIGHT_TIER_1}; ≤${IF_LOCATION_PREMIUM_TIER_2} → ×${IF_LOCATION_WEIGHT_TIER_2}; ≤${IF_LOCATION_PREMIUM_TIER_3} → ×${IF_LOCATION_WEIGHT_TIER_3}; otherwise ×${IF_LOCATION_WEIGHT_FAR}. If this home has no location premium, every comp uses ×1.`,
    'Example: same-vintage (×4) and close location tier (×2.5) → wt 10.00. Neighboring vintage (×1.75) and far tier (×0.85) → wt 1.49.',
  ]
}

export type IfEstimateContext = {
  subjectVintage?: VintageBucketId | null
  locationPremium?: LocationPremiumFactors | null
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function weightedAverage(
  entries: readonly { value: number; weight: number }[],
): number | null {
  const valid = entries.filter((e) => e.weight > 0 && Number.isFinite(e.value))
  if (valid.length === 0) return null
  const totalWeight = valid.reduce((sum, e) => sum + e.weight, 0)
  if (totalWeight <= 0) return null
  return valid.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight
}

function averageOf(
  entries: readonly { value: number; weight: number }[],
): number | null {
  const valid = entries.filter((e) => Number.isFinite(e.value))
  if (valid.length === 0) return null
  return valid.reduce((sum, e) => sum + e.value, 0) / valid.length
}

function aggregateEntries(
  entries: readonly { value: number; weight: number }[],
  method: IfMidpointMethod,
): number | null {
  if (method === 'median') {
    return median(
      entries
        .filter((e) => Number.isFinite(e.value))
        .map((e) => e.value),
    )
  }
  if (method === 'average') return averageOf(entries)
  return weightedAverage(entries)
}

function weightedPercentile(
  entries: readonly { value: number; weight: number }[],
  percentile: number,
): number | null {
  const valid = entries.filter((e) => e.weight > 0 && Number.isFinite(e.value))
  if (valid.length === 0) return null

  const sorted = [...valid].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, e) => sum + e.weight, 0)
  if (totalWeight <= 0) return null

  const target = totalWeight * percentile
  let cumulative = 0
  for (const entry of sorted) {
    cumulative += entry.weight
    if (cumulative >= target) return entry.value
  }
  return sorted[sorted.length - 1]!.value
}

function validPpsf(value: number | null | undefined): value is number {
  return value != null && value > 0 && Number.isFinite(value)
}

function subjectPpsf(
  subjectPrice: number | null | undefined,
  subjectSqft: number | null | undefined,
): number | null {
  if (subjectPrice == null || subjectPrice <= 0) return null
  if (subjectSqft == null || subjectSqft <= 0) return null
  return subjectPrice / subjectSqft
}

function vintageWeight(
  subjectVintage: VintageBucketId | null | undefined,
  compVintage: VintageBucketId,
): number {
  if (!subjectVintage || subjectVintage === 'unknown') return 1
  const distance = vintageBucketDistance(subjectVintage, compVintage)
  if (distance === 0) return IF_VINTAGE_WEIGHT_SAME
  if (distance === 1) return IF_VINTAGE_WEIGHT_ADJACENT
  return IF_VINTAGE_WEIGHT_FAR
}

function locationPremiumWeight(
  subjectPremium: LocationPremiumFactors | null | undefined,
  compMultiplier: number,
): number {
  if (!subjectPremium || subjectPremium.combinedMultiplier === 1) {
    return 1
  }
  const diff = Math.abs(compMultiplier - subjectPremium.combinedMultiplier)
  if (diff <= IF_LOCATION_PREMIUM_TIER_1) return IF_LOCATION_WEIGHT_TIER_1
  if (diff <= IF_LOCATION_PREMIUM_TIER_2) return IF_LOCATION_WEIGHT_TIER_2
  if (diff <= IF_LOCATION_PREMIUM_TIER_3) return IF_LOCATION_WEIGHT_TIER_3
  return IF_LOCATION_WEIGHT_FAR
}

function locationPremiumRatio(
  subjectPremium: LocationPremiumFactors | null | undefined,
  compMultiplier: number,
): number {
  const subjectMult = subjectPremium?.combinedMultiplier ?? 1
  if (compMultiplier <= 0 || subjectMult === compMultiplier) return 1
  return subjectMult / compMultiplier
}

function adjustedCompPpsf(
  comp: ComparableListing,
  subjectPremium: LocationPremiumFactors | null | undefined,
): number | null {
  if (!validPpsf(comp.pricePerSqft)) return null
  return comp.pricePerSqft! * locationPremiumRatio(subjectPremium, comp.locationPremiumMultiplier)
}

function adjustedCompPrice(
  comp: ComparableListing,
  price: number,
  subjectPremium: LocationPremiumFactors | null | undefined,
): number {
  return price * locationPremiumRatio(subjectPremium, comp.locationPremiumMultiplier)
}

function compWeight(
  comp: ComparableListing,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): number {
  return (
    vintageWeight(subjectVintage, comp.vintageBucket) *
    locationPremiumWeight(subjectPremium, comp.locationPremiumMultiplier)
  )
}

/** Prefer comps at a similar $/sqft tier (same zip/neighborhood price level). */
function compsInSubjectPriceTier(
  comps: ComparableListing[],
  subjectPpsfValue: number | null,
): ComparableListing[] {
  const ranked = comps.slice(0, TOP_COMP_COUNT)
  if (subjectPpsfValue == null) return ranked

  const min = subjectPpsfValue * (1 - SUBJECT_PPSF_BAND)
  const max = subjectPpsfValue * (1 + SUBJECT_PPSF_BAND)
  const tiered = ranked.filter((comp) => {
    const ppsf = comp.pricePerSqft
    return validPpsf(ppsf) && ppsf >= min && ppsf <= max
  })

  return tiered.length >= 2 ? tiered : ranked
}

function soldCompPrice(comp: ComparableListing): number | null {
  if (comp.closePrice != null && comp.closePrice > 0) return comp.closePrice
  // Closed rentals often omit ClosePrice; list/rent price is the lease amount.
  if (comp.price != null && comp.price > 0) return comp.price
  return null
}

function activeCompPrice(comp: ComparableListing): number | null {
  if (comp.price != null && comp.price > 0) return comp.price
  return null
}

function ppsfEntries(
  comps: ComparableListing[],
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): { value: number; weight: number }[] {
  return comps
    .map((comp) => {
      const ppsf = adjustedCompPpsf(comp, subjectPremium)
      if (ppsf == null) return null
      return {
        value: ppsf,
        weight: compWeight(comp, subjectVintage, subjectPremium),
      }
    })
    .filter((entry): entry is { value: number; weight: number } => entry != null)
}

function priceEntries(
  comps: ComparableListing[],
  useClosePrice: boolean,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): { value: number; weight: number }[] {
  return comps
    .map((comp) => {
      const price = useClosePrice ? soldCompPrice(comp) : activeCompPrice(comp)
      if (price == null) return null
      return {
        value: adjustedCompPrice(comp, price, subjectPremium),
        weight: compWeight(comp, subjectVintage, subjectPremium),
      }
    })
    .filter((entry): entry is { value: number; weight: number } => entry != null)
}

function priceValues(
  comps: ComparableListing[],
  useClosePrice: boolean,
): number[] {
  return comps
    .map((comp) => (useClosePrice ? soldCompPrice(comp) : activeCompPrice(comp)))
    .filter((price): price is number => price != null)
}

function buildMidpointAggregatesFromPpsf(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): IfMidpointAggregates {
  const soldEntries = ppsfEntries(sold, subjectVintage, subjectPremium)
  const activeEntries = ppsfEntries(active, subjectVintage, subjectPremium)
  const out = emptyMidpointAggregates()
  for (const method of IF_MIDPOINT_METHODS) {
    const blended = blendedMarketPpsf(
      aggregateEntries(soldEntries, method),
      aggregateEntries(activeEntries, method),
    )
    out[method] = {
      blendedPpsf: blended,
      amount: blended != null ? Math.round(blended * subjectSqft) : null,
    }
  }
  return out
}

function buildMidpointAggregatesFromPrices(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number | null | undefined,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): IfMidpointAggregates {
  const soldEntries = priceEntries(sold, true, subjectVintage, subjectPremium)
  const activeEntries = priceEntries(
    active,
    false,
    subjectVintage,
    subjectPremium,
  )
  const out = emptyMidpointAggregates()
  const sqft =
    subjectSqft != null && subjectSqft > 0 ? subjectSqft : null
  for (const method of IF_MIDPOINT_METHODS) {
    const soldAgg = aggregateEntries(soldEntries, method)
    const activeAgg = aggregateEntries(activeEntries, method)
    let amount: number | null = null
    if (soldAgg != null && activeAgg != null) {
      amount = Math.round(
        soldAgg * SOLD_PPSF_WEIGHT + activeAgg * ACTIVE_PPSF_WEIGHT,
      )
    } else if (soldAgg != null) {
      amount = Math.round(soldAgg)
    } else if (activeAgg != null) {
      amount = Math.round(activeAgg)
    }
    out[method] = {
      amount,
      blendedPpsf:
        amount != null && sqft != null ? amount / sqft : null,
    }
  }
  return out
}

function blendedMarketPpsf(
  soldPpsf: number | null,
  activePpsf: number | null,
): number | null {
  if (soldPpsf != null && activePpsf != null) {
    return soldPpsf * SOLD_PPSF_WEIGHT + activePpsf * ACTIVE_PPSF_WEIGHT
  }
  return soldPpsf ?? activePpsf ?? null
}

function compAmountEntries(
  comps: ComparableListing[],
  subjectSqft: number | null,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
  useClosePrice: boolean,
): { value: number; weight: number }[] {
  return comps
    .map((comp) => {
      let value: number | null = null
      if (subjectSqft != null && subjectSqft > 0) {
        const ppsf = adjustedCompPpsf(comp, subjectPremium)
        if (ppsf != null) value = ppsf * subjectSqft
      } else {
        const price = useClosePrice ? soldCompPrice(comp) : activeCompPrice(comp)
        if (price != null) {
          value = adjustedCompPrice(comp, price, subjectPremium)
        }
      }
      if (value == null || value <= 0) return null
      return {
        value,
        weight: compWeight(comp, subjectVintage, subjectPremium),
      }
    })
    .filter((entry): entry is { value: number; weight: number } => entry != null)
}

function collectTierAmountEntries(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number | null,
  subjectPrice: number | null | undefined,
  context: IfEstimateContext,
): { value: number; weight: number }[] {
  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  return [
    ...compAmountEntries(
      tierSold,
      subjectSqft,
      subjectVintage,
      subjectPremium,
      true,
    ),
    ...compAmountEntries(
      tierActive,
      subjectSqft,
      subjectVintage,
      subjectPremium,
      false,
    ),
  ]
}

function finalizeEstimateRange(
  amount: number | null,
  amountEntries: readonly { value: number; weight: number }[],
  kind: 'sale' | 'rent',
): Pick<IfEstimate, 'amount' | 'amountLow' | 'amountHigh'> {
  if (amount == null) {
    return { amount: null, amountLow: null, amountHigh: null }
  }

  const minSpread =
    kind === 'rent' ? MIN_RENT_RANGE_SPREAD : MIN_SALE_RANGE_SPREAD

  if (amountEntries.length === 0) {
    const pad = Math.max(Math.round(amount * 0.08), minSpread)
    return {
      amount,
      amountLow: Math.round(amount - pad / 2),
      amountHigh: Math.round(amount + pad / 2),
    }
  }

  if (amountEntries.length === 1) {
    const only = amountEntries[0]!.value
    const pad = Math.max(Math.round(only * SINGLE_COMP_RANGE_PAD), minSpread / 2)
    return {
      amount,
      amountLow: Math.round(Math.min(amount, only) - pad),
      amountHigh: Math.round(Math.max(amount, only) + pad),
    }
  }

  let low =
    weightedPercentile(amountEntries, RANGE_LOW_PERCENTILE) ?? amount
  let high =
    weightedPercentile(amountEntries, RANGE_HIGH_PERCENTILE) ?? amount

  low = Math.min(low, amount)
  high = Math.max(high, amount)

  if (high - low < minSpread) {
    const mid = (low + high) / 2
    low = mid - minSpread / 2
    high = mid + minSpread / 2
  }

  return {
    amount,
    amountLow: Math.round(low),
    amountHigh: Math.round(high),
  }
}

/** $/sqft from location-matched comps, scaled to subject living area. */
function estimateFromPpsf(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number,
  subjectPrice: number | null | undefined,
  context: IfEstimateContext,
  kind: 'sale' | 'rent',
): IfEstimate & { midpointAggregates: IfMidpointAggregates } {
  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  const midpointAggregates = buildMidpointAggregatesFromPpsf(
    tierSold,
    tierActive,
    subjectSqft,
    subjectVintage,
    subjectPremium,
  )
  const ppsf = midpointAggregates[IF_DEFAULT_MIDPOINT_METHOD].blendedPpsf
  const soldCount = tierSold.filter((c) => validPpsf(c.pricePerSqft)).length
  const activeCount = tierActive.filter((c) => validPpsf(c.pricePerSqft)).length
  const amountEntries = collectTierAmountEntries(
    sold,
    active,
    subjectSqft,
    subjectPrice,
    context,
  )

  if (ppsf == null) {
    return {
      amount: null,
      amountLow: null,
      amountHigh: null,
      soldCount,
      activeCount,
      midpointAggregates,
    }
  }

  const amount = midpointAggregates[IF_DEFAULT_MIDPOINT_METHOD].amount
  return {
    ...finalizeEstimateRange(amount, amountEntries, kind),
    soldCount,
    activeCount,
    midpointAggregates,
  }
}

/** Fallback when $/sqft is unavailable: median closed sale, then ask prices. */
function estimateFromPrices(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectPrice: number | null | undefined,
  subjectSqft: number | null | undefined,
  context: IfEstimateContext,
  kind: 'sale' | 'rent',
): IfEstimate & { midpointAggregates: IfMidpointAggregates } {
  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  const midpointAggregates = buildMidpointAggregatesFromPrices(
    tierSold,
    tierActive,
    subjectSqft,
    subjectVintage,
    subjectPremium,
  )
  const amount = midpointAggregates[IF_DEFAULT_MIDPOINT_METHOD].amount

  const amountEntries = collectTierAmountEntries(
    sold,
    active,
    subjectSqft ?? null,
    subjectPrice,
    context,
  )

  return {
    ...finalizeEstimateRange(amount, amountEntries, kind),
    soldCount: priceValues(tierSold, true).length,
    activeCount: priceValues(tierActive, false).length,
    midpointAggregates,
  }
}

export type IfEstimate = {
  amount: number | null
  amountLow: number | null
  amountHigh: number | null
  soldCount: number
  activeCount: number
}

/** Match rules — same tolerances as Sales / Rentals tabs. */
export type IfMatchParams = {
  kind: 'sale' | 'rent'
  zip: string | null
  beds: number | null
  baths: number | null
  lotAcres: number | null
  sqft: number | null
  bedTolerance: number
  bathTolerance: number
  sqftTolerancePct: number
  vintageLabel: string | null
  vintageEdgeLabels: string[]
  vintageEdgeFraction: number
  lookbackMonths: number
  lookbackLabel: string
  /** Present when the subject is furnished / partial / negotiable. */
  furnished?: ListingFurnished
}

/** One comparable that contributed to the estimate (hyperlinkable). */
export type IfCompRow = {
  mlsId: string
  listingKey: string
  address: string
  city: string | null
  /** Match fields — used by Criteria ± client filtering on What if. */
  zip: string | null
  beds: number | null
  baths: number | null
  lotAcres: number | null
  role: 'sold' | 'active'
  price: number | null
  closeDate: string | null
  sqft: number | null
  vintageLabel: string
  furnished: ListingFurnished | null
  pricePerSqft: number | null
  adjustedPricePerSqft: number | null
  /** Comp $/sqft (adjusted) × subject sqft, or adjusted price when no sqft. */
  impliedSubjectAmount: number | null
  weight: number
}

export type IfEstimateMath = {
  method: 'ppsf' | 'price' | 'none'
  soldPpsfWeight: number
  activePpsfWeight: number
  blendedPpsf: number | null
  /** Which cached midpoint is reflected in `amount` / `blendedPpsf`. */
  midpointMethod: IfMidpointMethod
  subjectSqft: number | null
  rangeLowPercentile: number
  rangeHighPercentile: number
  /** Matcher returned this many before top-N / tier filters. */
  matchedSoldCount: number
  matchedActiveCount: number
}

/** Full sale or rent scenario for the What if panel. */
export type IfScenario = IfEstimate & {
  params: IfMatchParams
  math: IfEstimateMath
  comps: IfCompRow[]
  /** Median / average / weighted-average midpoints — pick without refetch. */
  midpointAggregates: IfMidpointAggregates
}

/** Fill midpoint aggregates for older cached payloads that only stored one mid. */
export function ensureMidpointAggregates(scenario: IfScenario): IfScenario {
  const existing = scenario.midpointAggregates
  const hasCached =
    existing &&
    IF_MIDPOINT_METHODS.some((m) => existing[m]?.amount != null)
  if (hasCached) {
    return {
      ...scenario,
      math: {
        ...scenario.math,
        midpointMethod:
          scenario.math.midpointMethod ?? IF_DEFAULT_MIDPOINT_METHOD,
      },
    }
  }
  const shared: IfMidpointVariant = {
    amount: scenario.amount,
    blendedPpsf: scenario.math?.blendedPpsf ?? null,
  }
  return {
    ...scenario,
    midpointAggregates: {
      median: { ...shared },
      average: { ...shared },
      weightedAverage: { ...shared },
    },
    math: {
      ...scenario.math,
      midpointMethod:
        scenario.math.midpointMethod ?? IF_DEFAULT_MIDPOINT_METHOD,
    },
  }
}

/** Swap the displayed midpoint to a precomputed aggregation (range unchanged). */
export function scenarioWithMidpointMethod(
  scenario: IfScenario,
  method: IfMidpointMethod,
): IfScenario {
  const base = ensureMidpointAggregates(scenario)
  const variant = base.midpointAggregates[method]
  if (variant.amount == null && base.amount == null) {
    return {
      ...base,
      math: { ...base.math, midpointMethod: method },
    }
  }
  if (variant.amount == null) return base
  return {
    ...base,
    amount: variant.amount,
    math: {
      ...base.math,
      blendedPpsf: variant.blendedPpsf,
      midpointMethod: method,
    },
  }
}

export type ListingIfPayload = {
  mlsId: string
  sale: IfScenario
  rent: IfScenario
  computedAt: string | null
  cached: boolean
  locationLabel: string | null
  locationPremiumLabels?: string[]
  subjectVintageLabel?: string | null
  subjectSqft?: number | null
  /** Subject listing is a rental — mobile What if defaults to “If you rent”. */
  subjectIsRental?: boolean
  /** Admin Market Bands — attached by `/if` API for sale midpoint labeling. */
  inventorySegmentBands?: InventorySegmentBandsConfig
}

export function buildIfMatchParams(
  kind: 'sale' | 'rent',
  criteria: ComparablesCriteria | null,
  lookbackMonths: number = COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
  match: PricingMatchingConfig = DEFAULT_PRICING_MATCHING_CONFIG,
): IfMatchParams {
  return {
    kind,
    zip: criteria?.zip ?? null,
    beds: criteria?.beds ?? null,
    baths: criteria?.baths ?? null,
    lotAcres: null,
    sqft: criteria?.sqft ?? null,
    bedTolerance: match.bedTolerance,
    bathTolerance: match.bathTolerance,
    sqftTolerancePct: Math.round(match.sqftTolerance * 100),
    vintageLabel: criteria?.vintageLabel ?? null,
    vintageEdgeLabels: criteria?.vintageEdgeLabels ?? [],
    vintageEdgeFraction: match.vintageEdgeFraction,
    lookbackMonths,
    lookbackLabel: lookbackLabel(lookbackMonths),
    ...(criteria?.furnished ? { furnished: criteria.furnished } : {}),
  }
}

function emptyScenario(
  params: IfMatchParams,
  matchedSoldCount: number,
  matchedActiveCount: number,
): IfScenario {
  return {
    amount: null,
    amountLow: null,
    amountHigh: null,
    soldCount: 0,
    activeCount: 0,
    params,
    math: {
      method: 'none',
      soldPpsfWeight: SOLD_PPSF_WEIGHT,
      activePpsfWeight: ACTIVE_PPSF_WEIGHT,
      blendedPpsf: null,
      midpointMethod: IF_DEFAULT_MIDPOINT_METHOD,
      subjectSqft: params.sqft,
      rangeLowPercentile: RANGE_LOW_PERCENTILE,
      rangeHighPercentile: RANGE_HIGH_PERCENTILE,
      matchedSoldCount,
      matchedActiveCount,
    },
    comps: [],
    midpointAggregates: emptyMidpointAggregates(),
  }
}

function buildCompRows(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number | null,
  context: IfEstimateContext,
): IfCompRow[] {
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  const toRow = (
    comp: ComparableListing,
    role: 'sold' | 'active',
  ): IfCompRow | null => {
    const price =
      role === 'sold' ? soldCompPrice(comp) : activeCompPrice(comp)
    if (price == null) return null
    const adjPpsf = adjustedCompPpsf(comp, subjectPremium)
    let implied: number | null = null
    if (subjectSqft != null && subjectSqft > 0 && adjPpsf != null) {
      implied = Math.round(adjPpsf * subjectSqft)
    } else {
      implied = Math.round(adjustedCompPrice(comp, price, subjectPremium))
    }
    return {
      mlsId: comp.mlsId,
      listingKey: comp.listingKey?.trim() || comp.mlsId,
      address: comp.address,
      city: comp.city,
      zip: comp.zip,
      beds: comp.beds,
      baths: comp.baths,
      lotAcres: comp.lotAcres,
      role,
      price,
      closeDate: role === 'sold' ? comp.closeDate : null,
      sqft: comp.sqft,
      vintageLabel: comp.vintageLabel,
      furnished: comp.furnished ?? null,
      pricePerSqft: validPpsf(comp.pricePerSqft) ? comp.pricePerSqft : null,
      adjustedPricePerSqft: adjPpsf,
      impliedSubjectAmount: implied,
      weight: compWeight(comp, subjectVintage, subjectPremium),
    }
  }

  return [
    ...sold.map((c) => toRow(c, 'sold')),
    ...active.map((c) => toRow(c, 'active')),
  ].filter((row): row is IfCompRow => row != null)
}

/**
 * CMA-style estimate from zip-matched comparables ranked by fit.
 * Same match tolerances as Sales / Rentals; returns comps + math for the panel.
 */
export function estimateFromComparables(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft?: number | null,
  subjectPrice?: number | null,
  context: IfEstimateContext = {},
  kind: 'sale' | 'rent' = 'sale',
  params?: IfMatchParams,
  matchedSoldCount?: number,
  matchedActiveCount?: number,
): IfScenario {
  const resolvedParams =
    params ??
    buildIfMatchParams(kind, null, COMPARABLES_DEFAULT_LOOKBACK_MONTHS)
  const matchedSold = matchedSoldCount ?? sold.length
  const matchedActive = matchedActiveCount ?? active.length

  if (subjectSqft != null && subjectSqft > 0) {
    const fromPpsf = estimateFromPpsf(
      sold,
      active,
      subjectSqft,
      subjectPrice,
      context,
      kind,
    )
    if (fromPpsf.amount != null) {
      return finalizeScenario(
        fromPpsf,
        sold,
        active,
        subjectSqft,
        subjectPrice,
        context,
        kind,
        resolvedParams,
        matchedSold,
        matchedActive,
        'ppsf',
        fromPpsf.midpointAggregates,
      )
    }
  }

  const fromPrices = estimateFromPrices(
    sold,
    active,
    subjectPrice,
    subjectSqft,
    context,
    kind,
  )
  return finalizeScenario(
    fromPrices,
    sold,
    active,
    subjectSqft ?? null,
    subjectPrice,
    context,
    kind,
    resolvedParams,
    matchedSold,
    matchedActive,
    fromPrices.amount != null ? 'price' : 'none',
    fromPrices.midpointAggregates,
  )
}

function finalizeScenario(
  estimate: IfEstimate,
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft: number | null,
  subjectPrice: number | null | undefined,
  context: IfEstimateContext,
  kind: 'sale' | 'rent',
  params: IfMatchParams,
  matchedSoldCount: number,
  matchedActiveCount: number,
  method: IfEstimateMath['method'],
  midpointAggregates: IfMidpointAggregates,
): IfScenario {
  if (estimate.amount == null && estimate.soldCount + estimate.activeCount === 0) {
    return emptyScenario(params, matchedSoldCount, matchedActiveCount)
  }

  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const primary = midpointAggregates[IF_DEFAULT_MIDPOINT_METHOD]

  return {
    ...estimate,
    params,
    math: {
      method,
      soldPpsfWeight: SOLD_PPSF_WEIGHT,
      activePpsfWeight: ACTIVE_PPSF_WEIGHT,
      blendedPpsf: primary.blendedPpsf,
      midpointMethod: IF_DEFAULT_MIDPOINT_METHOD,
      subjectSqft,
      rangeLowPercentile: RANGE_LOW_PERCENTILE,
      rangeHighPercentile: RANGE_HIGH_PERCENTILE,
      matchedSoldCount,
      matchedActiveCount,
    },
    comps: buildCompRows(tierSold, tierActive, subjectSqft, context),
    midpointAggregates,
  }
}

export function ifLocationLabel(
  city?: string | null,
  zip?: string | null,
): string | null {
  const town = city?.trim()
  const postal = zip?.trim()
  if (town && postal) return `${town} · ${postal}`
  if (town) return town
  if (postal) return postal
  return null
}

export function ifCompBasisText(
  soldCount: number,
  activeCount: number,
  kind: 'sale' | 'rental',
  locationLabel?: string | null,
  locationPremiumLabels?: string[] | null,
  subjectVintageLabel?: string | null,
): string | null {
  const parts: string[] = []
  if (soldCount > 0) {
    const word = kind === 'sale' ? 'sale' : 'lease'
    parts.push(
      `${soldCount} recent ${word}${soldCount === 1 ? '' : 's'}`,
    )
  }
  if (activeCount > 0) {
    const word = kind === 'sale' ? 'listing' : 'rental'
    parts.push(
      `${activeCount} active ${word}${activeCount === 1 ? '' : 's'}`,
    )
  }
  if (parts.length === 0) return null

  const location = locationLabel?.trim()
  const where = location
    ? `in ${location}`
    : 'in the same zip'

  const vintageNote = subjectVintageLabel?.trim()
    ? `, emphasizing ${subjectVintageLabel} vintage`
    : ''

  const premiumNote = formatLocationPremiumLabels(locationPremiumLabels ?? [])
  const premiumSuffix = premiumNote ? `. Location premium: ${premiumNote}` : ''

  return `Based on ${parts.join(' and ')} ${where} with similar beds, baths, and living area${vintageNote} — weighted to this property's price tier and location profile${premiumSuffix}.`
}

/** Resolve subject vintage bucket id from year built. */
export function subjectVintageFromYear(
  yearBuilt: number | null | undefined,
): VintageBucketId {
  return classifyYearBuilt(yearBuilt)
}

export function fmtIfEstimateRange(
  low: number | null,
  high: number | null,
  fmt: (value: number | null) => string,
  midpoint?: number | null,
): string {
  if (low != null && high != null) {
    if (low === high) return fmt(low)
    return `Between ${fmt(low)} and ${fmt(high)}`
  }
  if (midpoint != null) return fmt(midpoint)
  return "—"
}

/** Sale estimates on the If page — nearest $1,000; $869K below $1M, $1.2M at/above $1M. */
export function roundIfSaleAmount(amount: number): number {
  return Math.round(amount / 1_000) * 1_000
}

function formatIfSaleMillions(millions: number): string {
  const rounded =
    millions >= 10
      ? Math.round(millions)
      : Math.round(millions * 10) / 10
  const label =
    rounded % 1 === 0
      ? rounded.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `$${label}M`
}

export function fmtIfSaleMoney(amount: number | null): string {
  if (amount == null) return '—'
  const rounded = roundIfSaleAmount(amount)
  if (rounded >= 1_000_000) {
    return formatIfSaleMillions(rounded / 1_000_000)
  }
  const thousands = rounded / 1_000
  return `$${thousands.toLocaleString('en-US')}K`
}

/** Rent low/high on the If page — floor/ceil to nearest $100. */
export function roundIfRentLow(amount: number): number {
  return Math.floor(amount / 100) * 100
}

export function roundIfRentHigh(amount: number): number {
  return Math.ceil(amount / 100) * 100
}

export function roundIfRentMidpoint(amount: number): number {
  return Math.round(amount / 100) * 100
}

/**
 * Rent amounts on the If page — `$4.5K` (thousands, always one decimal).
 * Pair with the range display: `$4.5K ←→ $5.2K`.
 */
export function fmtIfRentMoney(amount: number | null): string {
  if (amount == null) return '—'
  const thousands = amount / 1_000
  return `$${thousands.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}K`
}

export function fmtIfRentEstimateRange(
  low: number | null,
  high: number | null,
  midpoint?: number | null,
): string {
  const roundedLow = low != null ? roundIfRentLow(low) : null
  const roundedHigh = high != null ? roundIfRentHigh(high) : null
  const roundedMid =
    midpoint != null ? roundIfRentMidpoint(midpoint) : null
  if (roundedLow != null && roundedHigh != null && roundedLow !== roundedHigh) {
    return `${fmtIfRentMoney(roundedLow)} ←→ ${fmtIfRentMoney(roundedHigh)}/mo`
  }
  const range = fmtIfEstimateRange(
    roundedLow,
    roundedHigh,
    fmtIfRentMoney,
    roundedMid,
  )
  if (range === '—') return range
  return `${range}/mo`
}
