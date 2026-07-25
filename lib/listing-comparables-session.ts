/**
 * Client-session match overrides for Sales / Rentals comps criteria.
 * Seeded from Admin → Pricing (`PricingMatchingConfig`); reset when the
 * Sold ↔ Rented tab changes.
 */

import type { ComparableListing, ComparablesCriteria } from '@/lib/listing-comparables-shared'
import { vintageCriteriaList } from '@/lib/listing-comparables-shared'
import type { PricingMatchingConfig } from '@/lib/pricing-matching-config-shared'
import { DEFAULT_PRICING_MATCHING_CONFIG } from '@/lib/pricing-matching-config-shared'
import { normalizeZip, townForZip, TOWN_ZIPS } from '@/lib/tmre-towns'
import { VINTAGE_BUCKETS, type VintageBucketId } from '@/lib/vintage-buckets'

export type SessionMatchOverrides = {
  bedTolerance: number
  bathTolerance: number
  /** Whole percent 0–100. */
  sqftTolerancePct: number
  /** Predefined vintage labels currently allowed (oldest → newest). */
  allowedVintageLabels: string[]
  /**
   * Subject zip plus any same-town zips the user has opened with ±.
   * Always includes the subject's zip.
   */
  allowedZips: string[]
  /**
   * When subject is furnished: exact = same status; any = all furnish types
   * (including Unfurnished). Omitted when the criterion does not apply.
   */
  furnishedScope?: 'exact' | 'any'
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
  const subjectZip = normalizeZip(criteria.zip) ?? criteria.zip
  return {
    bedTolerance: clampInt(match.bedTolerance, 0, SESSION_BED_TOLERANCE_MAX),
    bathTolerance: clampInt(match.bathTolerance, 0, SESSION_BATH_TOLERANCE_MAX),
    sqftTolerancePct: percentFromFraction(match.sqftTolerance),
    allowedVintageLabels: labels.length > 0 ? labels : [criteria.vintageLabel],
    allowedZips: subjectZip ? [subjectZip] : [],
    ...(criteria.furnished ? { furnishedScope: 'exact' as const } : {}),
  }
}

export function defaultSessionOverrides(
  criteria: ComparablesCriteria,
): SessionMatchOverrides {
  return sessionOverridesFromPricingConfig(DEFAULT_PRICING_MATCHING_CONFIG, criteria)
}

/** True when session overrides match the seeded / original baseline. */
function sortZips(zips: string[]): string[] {
  return [...zips].map((z) => normalizeZip(z) ?? z).filter(Boolean).sort()
}

export function sessionMatchOverridesEqual(
  a: SessionMatchOverrides,
  b: SessionMatchOverrides,
): boolean {
  if (a.bedTolerance !== b.bedTolerance) return false
  if (a.bathTolerance !== b.bathTolerance) return false
  if (a.sqftTolerancePct !== b.sqftTolerancePct) return false
  if ((a.furnishedScope ?? null) !== (b.furnishedScope ?? null)) return false
  const za = sortZips(a.allowedZips ?? [])
  const zb = sortZips(b.allowedZips ?? [])
  if (za.length !== zb.length || za.some((z, i) => z !== zb[i])) return false
  const aa = sortVintageLabels(a.allowedVintageLabels)
  const bb = sortVintageLabels(b.allowedVintageLabels)
  if (aa.length !== bb.length) return false
  return aa.every((label, i) => label === bb[i])
}

/** True when session overrides need a wider server pool than admin defaults. */
export function sessionOverridesNeedWidePool(
  session: SessionMatchOverrides,
  baseline: SessionMatchOverrides,
): boolean {
  if (session.bedTolerance > baseline.bedTolerance) return true
  if (session.bathTolerance > baseline.bathTolerance) return true
  if (session.sqftTolerancePct > baseline.sqftTolerancePct) return true
  if (session.allowedVintageLabels.length > baseline.allowedVintageLabels.length) {
    return true
  }
  if ((session.allowedZips?.length ?? 0) > (baseline.allowedZips?.length ?? 0)) {
    return true
  }
  if (
    session.furnishedScope === 'any' &&
    baseline.furnishedScope === 'exact'
  ) {
    return true
  }
  return false
}

/** Town zips the subject may expand into (same town only). */
export function townZipsForSubject(
  subjectZip: string,
  townZips: readonly string[],
): string[] {
  const subject = normalizeZip(subjectZip)
  const town = townForZip(subject)
  const allowed = new Set(
    (town ? TOWN_ZIPS[town] : []).filter(Boolean),
  )
  const fromCache: string[] = []
  for (const raw of townZips) {
    const z = normalizeZip(raw)
    if (!z) continue
    if (allowed.size > 0 && !allowed.has(z)) continue
    fromCache.push(z)
  }
  const merged = new Set<string>(fromCache)
  if (subject && (allowed.size === 0 || allowed.has(subject))) merged.add(subject)
  return [...merged].sort()
}

export function canExpandZips(
  allowed: string[],
  subjectZip: string,
  townZips: readonly string[],
): boolean {
  const pool = townZipsForSubject(subjectZip, townZips)
  const have = new Set(sortZips(allowed))
  return pool.some((z) => !have.has(z))
}

export function canShrinkZips(allowed: string[], subjectZip: string): boolean {
  const subject = normalizeZip(subjectZip) ?? subjectZip
  const sorted = sortZips(allowed)
  return sorted.length > 1 && sorted.some((z) => z !== subject)
}

/** Add the next same-town zip (numeric order) not already allowed. */
export function expandAllowedZips(
  allowed: string[],
  subjectZip: string,
  townZips: readonly string[],
): string[] {
  const pool = townZipsForSubject(subjectZip, townZips)
  const have = new Set(sortZips(allowed))
  const next = pool.find((z) => !have.has(z))
  if (!next) return sortZips(allowed)
  const subject = normalizeZip(subjectZip) ?? subjectZip
  return sortZips([...have, next, subject])
}

/** Drop the zip furthest from the subject (keep subject). */
export function shrinkAllowedZips(
  allowed: string[],
  subjectZip: string,
): string[] {
  const subject = normalizeZip(subjectZip) ?? subjectZip
  const sorted = sortZips(allowed)
  if (sorted.length <= 1) return subject ? [subject] : sorted
  const subjectNum = Number(subject)
  let remove = sorted.find((z) => z !== subject) ?? sorted[sorted.length - 1]!
  let bestDist = -1
  for (const z of sorted) {
    if (z === subject) continue
    const dist = Math.abs(Number(z) - subjectNum)
    if (dist >= bestDist) {
      bestDist = dist
      remove = z
    }
  }
  const next = sorted.filter((z) => z !== remove)
  if (!next.includes(subject)) next.push(subject)
  return sortZips(next)
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
  const compZip = normalizeZip(comp.zip) ?? comp.zip
  const allowedZips = sortZips(session.allowedZips?.length ? session.allowedZips : [criteria.zip])
  if (!compZip || !allowedZips.includes(compZip)) return false

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

  if (criteria.furnished && (session.furnishedScope ?? 'exact') === 'exact') {
    // Unknown furnish status passes until disclosed; disclosed mismatches fail.
    if (comp.furnished != null && comp.furnished !== criteria.furnished) {
      return false
    }
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
    sqftTolerance: 1,
    // Pull bordering eras aggressively so session vintage +/- has headroom.
    vintageEdgeFraction: 1,
  }
}

function sessionPoolMatchCount(
  sold: readonly ComparableListing[],
  active: readonly ComparableListing[],
  criteria: ComparablesCriteria,
  session: SessionMatchOverrides,
): number {
  let n = 0
  for (const row of sold) {
    if (comparableListingMatchesSession(row, criteria, session)) n += 1
  }
  for (const row of active) {
    if (comparableListingMatchesSession(row, criteria, session)) n += 1
  }
  return n
}

/**
 * When Admin defaults (±1 bed/bath, ±30% sqft) yield zero comps — common for
 * extreme luxury (e.g. 9bd/14ba) — widen session tolerances against the wide
 * pool until at least one match appears (or the interactive caps are hit).
 */
export function widenSessionUntilPoolMatches(
  sold: readonly ComparableListing[],
  active: readonly ComparableListing[],
  criteria: ComparablesCriteria,
  seed: SessionMatchOverrides,
  townZips: readonly string[] = [],
): SessionMatchOverrides {
  let session: SessionMatchOverrides = {
    ...seed,
    allowedVintageLabels: [...seed.allowedVintageLabels],
    allowedZips: [...(seed.allowedZips ?? [criteria.zip])],
  }
  if (sessionPoolMatchCount(sold, active, criteria, session) > 0) {
    return session
  }

  for (let step = 0; step < 24; step += 1) {
    let grew = false
    const nextBed = bumpBedTolerance(session.bedTolerance, 1)
    if (nextBed !== session.bedTolerance) {
      session = { ...session, bedTolerance: nextBed }
      grew = true
    }
    const nextBath = bumpBathTolerance(session.bathTolerance, 1)
    if (nextBath !== session.bathTolerance) {
      session = { ...session, bathTolerance: nextBath }
      grew = true
    }
    const nextSqft = bumpPercentTolerance(session.sqftTolerancePct, 1)
    if (nextSqft !== session.sqftTolerancePct) {
      session = { ...session, sqftTolerancePct: nextSqft }
      grew = true
    }
    if (canExpandVintage(session.allowedVintageLabels)) {
      session = {
        ...session,
        allowedVintageLabels: expandVintageLabels(session.allowedVintageLabels),
      }
      grew = true
    }
    if (townZips.length > 0) {
      const nextZips = expandAllowedZips(
        session.allowedZips,
        criteria.zip,
        townZips,
      )
      if (nextZips.length > session.allowedZips.length) {
        session = { ...session, allowedZips: nextZips }
        grew = true
      }
    }
    if (sessionPoolMatchCount(sold, active, criteria, session) > 0) {
      return session
    }
    if (!grew) break
  }
  return session
}

export function vintageIdsFromLabels(labels: string[]): VintageBucketId[] {
  const out: VintageBucketId[] = []
  for (const label of labels) {
    const bucket = VINTAGE_BUCKETS.find((b) => b.label === label)
    if (bucket) out.push(bucket.id)
  }
  return out
}
