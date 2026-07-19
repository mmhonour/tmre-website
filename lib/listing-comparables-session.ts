/**
 * Client-session match overrides for Sales / Rentals comps criteria.
 * Seeded from Admin → Pricing (`PricingMatchingConfig`); reset when the
 * Sold ↔ Rented tab changes.
 */

import type { ComparableListing, ComparablesCriteria } from '@/lib/listing-comparables-shared'
import { vintageCriteriaList } from '@/lib/listing-comparables-shared'
import type { PricingMatchingConfig } from '@/lib/pricing-matching-config-shared'
import { DEFAULT_PRICING_MATCHING_CONFIG } from '@/lib/pricing-matching-config-shared'
import { VINTAGE_BUCKETS, type VintageBucketId } from '@/lib/vintage-buckets'

export type SessionMatchOverrides = {
  bedTolerance: number
  bathTolerance: number
  /** Whole percent 0–100. */
  sqftTolerancePct: number
  /** Whole percent 0–100. */
  lotTolerancePct: number
  /** Predefined vintage labels currently allowed (oldest → newest). */
  allowedVintageLabels: string[]
}

export const SESSION_BED_TOLERANCE_MAX = 5
export const SESSION_BATH_TOLERANCE_MAX = 5
export const SESSION_PERCENT_STEP = 5

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampPercent(n: number): number {
  return clampInt(n, 0, 100)
}

function percentFromFraction(fraction: number): number {
  return clampPercent(Math.round(fraction * 100))
}

export function sessionOverridesFromPricingConfig(
  match: PricingMatchingConfig,
  criteria: ComparablesCriteria,
): SessionMatchOverrides {
  const labels = vintageCriteriaList(criteria)
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    bedTolerance: clampInt(match.bedTolerance, 0, SESSION_BED_TOLERANCE_MAX),
    bathTolerance: clampInt(match.bathTolerance, 0, SESSION_BATH_TOLERANCE_MAX),
    sqftTolerancePct: percentFromFraction(match.sqftTolerance),
    lotTolerancePct: percentFromFraction(match.lotAcreTolerance),
    allowedVintageLabels: labels.length > 0 ? labels : [criteria.vintageLabel],
  }
}

export function defaultSessionOverrides(
  criteria: ComparablesCriteria,
): SessionMatchOverrides {
  return sessionOverridesFromPricingConfig(DEFAULT_PRICING_MATCHING_CONFIG, criteria)
}

/** True when session overrides need a wider server pool than admin defaults. */
export function sessionOverridesNeedWidePool(
  session: SessionMatchOverrides,
  baseline: SessionMatchOverrides,
): boolean {
  if (session.bedTolerance > baseline.bedTolerance) return true
  if (session.bathTolerance > baseline.bathTolerance) return true
  if (session.sqftTolerancePct > baseline.sqftTolerancePct) return true
  if (session.lotTolerancePct > baseline.lotTolerancePct) return true
  if (session.allowedVintageLabels.length > baseline.allowedVintageLabels.length) {
    return true
  }
  return false
}

function vintageLabelIndex(label: string): number {
  return VINTAGE_BUCKETS.findIndex((b) => b.label === label)
}

function sortVintageLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const ia = vintageLabelIndex(a)
    const ib = vintageLabelIndex(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

export function canExpandVintage(allowed: string[]): boolean {
  const sorted = sortVintageLabels(allowed).filter((l) => vintageLabelIndex(l) >= 0)
  if (sorted.length === 0) return false
  const lo = vintageLabelIndex(sorted[0]!)
  const hi = vintageLabelIndex(sorted[sorted.length - 1]!)
  return lo > 0 || hi < VINTAGE_BUCKETS.length - 1
}

export function canShrinkVintage(
  allowed: string[],
  subjectVintageLabel: string,
): boolean {
  const sorted = sortVintageLabels(allowed)
  if (sorted.length <= 1) return false
  // Always keep the subject's own vintage.
  return sorted.some((l) => l !== subjectVintageLabel)
}

/** Add the next adjacent predefined vintage bucket (older first, then newer). */
export function expandVintageLabels(allowed: string[]): string[] {
  const sorted = sortVintageLabels(allowed).filter((l) => vintageLabelIndex(l) >= 0)
  if (sorted.length === 0) return allowed
  const lo = vintageLabelIndex(sorted[0]!)
  const hi = vintageLabelIndex(sorted[sorted.length - 1]!)
  if (lo > 0) {
    return sortVintageLabels([...sorted, VINTAGE_BUCKETS[lo - 1]!.label])
  }
  if (hi < VINTAGE_BUCKETS.length - 1) {
    return sortVintageLabels([...sorted, VINTAGE_BUCKETS[hi + 1]!.label])
  }
  return sorted
}

/** Remove the vintage furthest from the subject (keep subject label). */
export function shrinkVintageLabels(
  allowed: string[],
  subjectVintageLabel: string,
): string[] {
  const sorted = sortVintageLabels(allowed).filter((l) => vintageLabelIndex(l) >= 0)
  if (sorted.length <= 1) return sorted
  const subjectIdx = vintageLabelIndex(subjectVintageLabel)
  if (subjectIdx < 0) {
    return sorted.slice(0, -1)
  }
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const distFirst = Math.abs(vintageLabelIndex(first) - subjectIdx)
  const distLast = Math.abs(vintageLabelIndex(last) - subjectIdx)
  const remove = distLast >= distFirst ? last : first
  if (remove === subjectVintageLabel && sorted.length > 1) {
    const other = remove === last ? first : last
    return sorted.filter((l) => l !== other)
  }
  return sorted.filter((l) => l !== remove)
}

export function bumpBedTolerance(current: number, delta: 1 | -1): number {
  return clampInt(current + delta, 0, SESSION_BED_TOLERANCE_MAX)
}

export function bumpBathTolerance(current: number, delta: 1 | -1): number {
  return clampInt(current + delta, 0, SESSION_BATH_TOLERANCE_MAX)
}

export function bumpPercentTolerance(current: number, delta: 1 | -1): number {
  return clampPercent(current + delta * SESSION_PERCENT_STEP)
}

export function comparableListingMatchesSession(
  comp: ComparableListing,
  criteria: ComparablesCriteria,
  session: SessionMatchOverrides,
): boolean {
  if (comp.zip !== criteria.zip) return false

  if (comp.beds == null) return false
  if (Math.abs(comp.beds - criteria.beds) > session.bedTolerance) return false

  if (comp.baths == null) return false
  if (Math.abs(comp.baths - criteria.baths) > session.bathTolerance) return false

  if (session.allowedVintageLabels.length > 0) {
    if (!session.allowedVintageLabels.includes(comp.vintageLabel)) return false
  }

  if (criteria.sqft != null && criteria.sqft > 0) {
    if (comp.sqft == null || comp.sqft <= 0) return false
    const frac = session.sqftTolerancePct / 100
    const min = criteria.sqft * (1 - frac)
    const max = criteria.sqft * (1 + frac)
    if (comp.sqft < min || comp.sqft > max) return false
  }

  if (criteria.lotAcres != null && criteria.lotAcres > 0) {
    if (comp.lotAcres == null || comp.lotAcres <= 0) return false
    const frac = session.lotTolerancePct / 100
    const min = criteria.lotAcres * (1 - frac)
    const max = criteria.lotAcres * (1 + frac)
    if (comp.lotAcres < min || comp.lotAcres > max) return false
  }

  return true
}

/** Wide match config used for the interactive pool (client filters back down). */
export function widePricingMatchingConfig(
  baseline: PricingMatchingConfig,
): PricingMatchingConfig {
  return {
    ...baseline,
    bedTolerance: SESSION_BED_TOLERANCE_MAX,
    bathTolerance: SESSION_BATH_TOLERANCE_MAX,
    lotAcreTolerance: 1,
    sqftTolerance: 1,
    // Pull bordering eras aggressively so session vintage +/- has headroom.
    vintageEdgeFraction: 1,
  }
}

export function vintageIdsFromLabels(labels: string[]): VintageBucketId[] {
  const out: VintageBucketId[] = []
  for (const label of labels) {
    const bucket = VINTAGE_BUCKETS.find((b) => b.label === label)
    if (bucket) out.push(bucket.id)
  }
  return out
}
