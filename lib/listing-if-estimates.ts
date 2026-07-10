import type { ComparableListing } from '@/lib/listing-comparables-shared'
import {
  formatLocationPremiumLabels,
  type LocationPremiumFactors,
} from '@/lib/listing-location-premium'
import {
  classifyYearBuilt,
  vintageBucketDistance,
  type VintageBucketId,
} from '@/lib/vintage-buckets'

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

function weightedMedian(
  entries: readonly { value: number; weight: number }[],
): number | null {
  const valid = entries.filter((e) => e.weight > 0 && Number.isFinite(e.value))
  if (valid.length === 0) return null

  const sorted = [...valid].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, e) => sum + e.weight, 0)
  if (totalWeight <= 0) return null

  let cumulative = 0
  for (const entry of sorted) {
    cumulative += entry.weight
    if (cumulative >= totalWeight / 2) return entry.value
  }
  return sorted[sorted.length - 1]!.value
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
  if (distance === 0) return 4
  if (distance === 1) return 1.75
  return 0.5
}

function locationPremiumWeight(
  subjectPremium: LocationPremiumFactors | null | undefined,
  compMultiplier: number,
): number {
  if (!subjectPremium || subjectPremium.combinedMultiplier === 1) return 1
  const diff = Math.abs(compMultiplier - subjectPremium.combinedMultiplier)
  if (diff <= 0.02) return 2.5
  if (diff <= 0.05) return 1.6
  if (diff <= 0.1) return 1.2
  return 0.85
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
  return null
}

function activeCompPrice(comp: ComparableListing): number | null {
  if (comp.price != null && comp.price > 0) return comp.price
  return null
}

function weightedPpsfMedian(
  comps: ComparableListing[],
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): number | null {
  const entries = comps
    .map((comp) => {
      const ppsf = adjustedCompPpsf(comp, subjectPremium)
      if (ppsf == null) return null
      return {
        value: ppsf,
        weight: compWeight(comp, subjectVintage, subjectPremium),
      }
    })
    .filter((entry): entry is { value: number; weight: number } => entry != null)
  return weightedMedian(entries)
}

function priceValues(
  comps: ComparableListing[],
  useClosePrice: boolean,
): number[] {
  return comps
    .map((comp) => (useClosePrice ? soldCompPrice(comp) : activeCompPrice(comp)))
    .filter((price): price is number => price != null)
}

function weightedPriceMedian(
  comps: ComparableListing[],
  useClosePrice: boolean,
  subjectVintage: VintageBucketId | null | undefined,
  subjectPremium: LocationPremiumFactors | null | undefined,
): number | null {
  const entries = comps
    .map((comp) => {
      const price = useClosePrice ? soldCompPrice(comp) : activeCompPrice(comp)
      if (price == null) return null
      return {
        value: adjustedCompPrice(comp, price, subjectPremium),
        weight: compWeight(comp, subjectVintage, subjectPremium),
      }
    })
    .filter((entry): entry is { value: number; weight: number } => entry != null)
  return weightedMedian(entries)
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
): IfEstimate {
  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  const soldPpsf = weightedPpsfMedian(tierSold, subjectVintage, subjectPremium)
  const activePpsf = weightedPpsfMedian(
    tierActive,
    subjectVintage,
    subjectPremium,
  )
  const ppsf = blendedMarketPpsf(soldPpsf, activePpsf)
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
    }
  }

  const amount = Math.round(ppsf * subjectSqft)
  return {
    ...finalizeEstimateRange(amount, amountEntries, kind),
    soldCount,
    activeCount,
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
): IfEstimate {
  const refPpsf = subjectPpsf(subjectPrice, subjectSqft)
  const tierSold = compsInSubjectPriceTier(sold, refPpsf)
  const tierActive = compsInSubjectPriceTier(active, refPpsf)
  const subjectVintage = context.subjectVintage ?? null
  const subjectPremium = context.locationPremium ?? null

  const soldMedian = weightedPriceMedian(
    tierSold,
    true,
    subjectVintage,
    subjectPremium,
  )
  const activeMedian = weightedPriceMedian(
    tierActive,
    false,
    subjectVintage,
    subjectPremium,
  )

  let amount: number | null = null
  if (soldMedian != null && activeMedian != null) {
    amount = Math.round(
      soldMedian * SOLD_PPSF_WEIGHT + activeMedian * ACTIVE_PPSF_WEIGHT,
    )
  } else if (soldMedian != null) {
    amount = Math.round(soldMedian)
  } else if (activeMedian != null) {
    amount = Math.round(activeMedian)
  }

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
  }
}

export type IfEstimate = {
  amount: number | null
  amountLow: number | null
  amountHigh: number | null
  soldCount: number
  activeCount: number
}

export type ListingIfPayload = {
  mlsId: string
  sale: IfEstimate
  rent: IfEstimate
  computedAt: string | null
  cached: boolean
  locationLabel: string | null
  locationPremiumLabels?: string[]
  subjectVintageLabel?: string | null
}

/**
 * CMA-style estimate from zip-matched comparables ranked by fit.
 * Weights same-vintage and location-similar comps, blends closed sales with
 * active listings, and applies a location premium for water, town center,
 * and golf/country club proximity.
 */
export function estimateFromComparables(
  sold: ComparableListing[],
  active: ComparableListing[],
  subjectSqft?: number | null,
  subjectPrice?: number | null,
  context: IfEstimateContext = {},
  kind: 'sale' | 'rent' = 'sale',
): IfEstimate {
  if (subjectSqft != null && subjectSqft > 0) {
    const fromPpsf = estimateFromPpsf(
      sold,
      active,
      subjectSqft,
      subjectPrice,
      context,
      kind,
    )
    if (fromPpsf.amount != null) return fromPpsf
  }
  return estimateFromPrices(
    sold,
    active,
    subjectPrice,
    subjectSqft,
    context,
    kind,
  )
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

  return `Based on ${parts.join(' and ')} ${where} with similar beds, baths, and lot size${vintageNote} — weighted to this property's price tier and location profile${premiumSuffix}.`
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

export function fmtIfRentMoney(amount: number | null): string {
  if (amount == null) return '—'
  return `$${amount.toLocaleString('en-US')}`
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
  const range = fmtIfEstimateRange(
    roundedLow,
    roundedHigh,
    fmtIfRentMoney,
    roundedMid,
  )
  if (range === '—') return range
  return `${range}/mo`
}
