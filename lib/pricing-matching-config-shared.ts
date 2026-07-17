import {
  COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
  COMPARABLES_LOOKBACK_OPTIONS,
  type ComparablesLookbackMonths,
} from '@/lib/listing-comparables-shared'

/**
 * Shared match rules for Sales / Rentals comparables, UAG, and What if.
 * Editable from Admin → Pricing; defaults match the historical hard-coded values.
 */
export type PricingMatchingConfig = {
  /** Adjacent bed counts allowed (±N). */
  bedTolerance: number
  /** Adjacent bath counts allowed (±N). */
  bathTolerance: number
  /** Lot acreage band as a fraction (0.4 = ±40%). */
  lotAcreTolerance: number
  /** Living-area band as a fraction (0.3 = ±30%). */
  sqftTolerance: number
  /** Fraction of a vintage bucket's year span for the edge rule (0.3 = 30%). */
  vintageEdgeFraction: number
  /** Default sold/rented look-back for Sales / Rentals / What if. */
  defaultLookbackMonths: ComparablesLookbackMonths
}

export const DEFAULT_PRICING_MATCHING_CONFIG: PricingMatchingConfig = {
  bedTolerance: 1,
  bathTolerance: 1,
  lotAcreTolerance: 0.4,
  sqftTolerance: 0.3,
  vintageEdgeFraction: 0.3,
  defaultLookbackMonths: COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
}

export const PRICING_MATCHING_FIELD_META: {
  key: keyof PricingMatchingConfig
  label: string
  hint: string
  kind: 'int' | 'percent' | 'lookback'
}[] = [
  {
    key: 'bedTolerance',
    label: 'Bed tolerance',
    hint: 'Adjacent bedroom counts allowed (±N).',
    kind: 'int',
  },
  {
    key: 'bathTolerance',
    label: 'Bath tolerance',
    hint: 'Adjacent bathroom counts allowed (±N).',
    kind: 'int',
  },
  {
    key: 'lotAcreTolerance',
    label: 'Lot size band',
    hint: 'Percent of subject acreage (±%).',
    kind: 'percent',
  },
  {
    key: 'sqftTolerance',
    label: 'Living area band',
    hint: 'Percent of subject sqft (±%).',
    kind: 'percent',
  },
  {
    key: 'vintageEdgeFraction',
    label: 'Vintage edge',
    hint: 'Percent of a vintage bucket span that also pulls in the bordering era.',
    kind: 'percent',
  },
  {
    key: 'defaultLookbackMonths',
    label: 'Default look-back',
    hint: 'Default sold/rented window on Sales, Rentals, and What if.',
    kind: 'lookback',
  },
]

export function clonePricingMatchingConfig(
  config: PricingMatchingConfig = DEFAULT_PRICING_MATCHING_CONFIG,
): PricingMatchingConfig {
  return { ...config }
}

export function isDefaultPricingMatchingConfig(
  config: PricingMatchingConfig,
): boolean {
  return (
    JSON.stringify(config) === JSON.stringify(DEFAULT_PRICING_MATCHING_CONFIG)
  )
}

/** Compact fingerprint for cache invalidation when match rules change. */
export function pricingMatchingConfigFingerprint(
  config: PricingMatchingConfig,
): string {
  return [
    config.bedTolerance,
    config.bathTolerance,
    config.lotAcreTolerance,
    config.sqftTolerance,
    config.vintageEdgeFraction,
    config.defaultLookbackMonths,
  ].join(':')
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampFraction(n: number, min: number, max: number): number {
  const rounded = Math.round(n * 1000) / 1000
  return Math.max(min, Math.min(max, rounded))
}

/**
 * Coerce/validate an admin payload into a full matching config.
 * Percent fields may be sent as fractions (0.4) or whole percents (40).
 */
export function normalizePricingMatchingConfig(input: unknown):
  | { ok: true; config: PricingMatchingConfig }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid config payload' }
  }
  const raw = input as Record<string, unknown>
  const bed = asNumber(raw.bedTolerance)
  const bath = asNumber(raw.bathTolerance)
  let lot = asNumber(raw.lotAcreTolerance)
  let sqft = asNumber(raw.sqftTolerance)
  let edge = asNumber(raw.vintageEdgeFraction)
  const lookback = asNumber(raw.defaultLookbackMonths)

  if (bed == null) return { ok: false, error: 'Bed tolerance is required' }
  if (bath == null) return { ok: false, error: 'Bath tolerance is required' }
  if (lot == null) return { ok: false, error: 'Lot size band is required' }
  if (sqft == null) return { ok: false, error: 'Living area band is required' }
  if (edge == null) return { ok: false, error: 'Vintage edge is required' }
  if (lookback == null) {
    return { ok: false, error: 'Default look-back is required' }
  }

  // Accept whole percents from the admin form (e.g. 40 → 0.4).
  if (lot > 1) lot = lot / 100
  if (sqft > 1) sqft = sqft / 100
  if (edge > 1) edge = edge / 100

  const lookbackMonths = Math.round(lookback) as ComparablesLookbackMonths
  if (
    !(COMPARABLES_LOOKBACK_OPTIONS as readonly number[]).includes(lookbackMonths)
  ) {
    return {
      ok: false,
      error: `Default look-back must be one of ${COMPARABLES_LOOKBACK_OPTIONS.join(', ')} months`,
    }
  }

  return {
    ok: true,
    config: {
      bedTolerance: clampInt(bed, 0, 5),
      bathTolerance: clampInt(bath, 0, 5),
      lotAcreTolerance: clampFraction(lot, 0.05, 1),
      sqftTolerance: clampFraction(sqft, 0.05, 1),
      vintageEdgeFraction: clampFraction(edge, 0.05, 1),
      defaultLookbackMonths: lookbackMonths,
    },
  }
}
