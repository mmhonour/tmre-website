import 'server-only'

import { FINISH_QUALITY_CACHE_PREFIX } from '@/lib/finish-quality'
import type { FinishQualityTier } from '@/lib/finish-quality-types'
import { kindOf } from '@/lib/goldilocks'
import { computeLocationPremium } from '@/lib/listing-location-premium'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readAllListingsFromDb,
  upsertListingEdgeScores,
} from '@/lib/db/listings-repo'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import { readStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { isClosedListing } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import { closedSalePrice } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, normalizeZip, resolveListingTown } from '@/lib/tmre-towns'
import { matchedRemarkPhrases } from '@/lib/remarks-phrase-match'

/** Bump when edge scoring weights / signals change so scores rebuild. */
export const EDGE_SCORE_ALGO_VERSION = 2

const WEIGHTS = {
  location: 0.12,
  age: 0.12,
  size: 0.12,
  layout: 0.12,
  condition: 0.32,
  value: 0.2,
} as const

const RENO_KEYWORDS = [
  'renovated',
  'updated',
  'new kitchen',
  'new bathrooms',
  'gut renovation',
  'fully remodeled',
  'brand new',
]

const QUALITY_KEYWORDS = [
  'granite',
  'hardwood',
  'stainless',
  'central air',
  'open floor plan',
  "chef's kitchen",
  'chefs kitchen',
  'quartz',
  'marble',
  'custom',
]

const LOW_QUALITY_KEYWORDS = ['carpet throughout', 'dated', 'original']

const CONDITION_DOWNGRADE_KEYWORDS = [
  'as-is',
  'as is',
  'needs tlc',
  'needs work',
  'fixer',
  'handyman',
  'estate condition',
  'tear down',
  'teardown',
  'investor special',
  'mold',
]

const GOOD_LAYOUT_KEYWORDS = [
  'open floor plan',
  'en suite',
  'master suite',
  'family room',
  'finished basement',
  'great room',
]

const BAD_LAYOUT_KEYWORDS = ['galley kitchen', 'small bedrooms', 'steep stairs', 'narrow']

const FINISH_TIER_SCORES: Record<FinishQualityTier, number> = {
  Premium: 95,
  Updated: 82,
  'Builder-grade': 58,
  Dated: 32,
}

export type EdgeScoreBreakdown = {
  location: number
  age: number
  size: number
  layout: number
  condition: number
  value: number
  composite: number
  weights: typeof WEIGHTS
  finishQualityTier: FinishQualityTier | null
  zipMedianPpsf: number | null
  zipMedianSqft: number | null
}

export type EdgeScoreMetadataSnapshot = {
  town: string | null
  zip: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  conditionSource: 'finish-quality' | 'remarks' | 'mixed' | 'default'
}

type ZipAggregate = {
  medianPpsf: number | null
  medianSqft: number | null
  topPpsf15: number | null
  bottomPpsf15: number | null
}

type EdgeScoreContext = {
  zipAggregates: Map<string, ZipAggregate>
  finishQualityByMlsId: Map<string, FinishQualityTier | null>
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const idx = Math.floor((sorted.length - 1) * p)
  return sorted[idx] ?? null
}

function collectRemarks(l: Listing): string {
  return [
    l.remarks,
    l.raw.PublicRemarks,
    l.raw.RemarksPublicAddendum,
    l.raw.RoomsAdditional,
    l.raw.PropertyInfo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matched(haystack: string, needles: string[]): string[] {
  return matchedRemarkPhrases(haystack, needles)
}

function referencePrice(l: Listing): number | null {
  if (isClosedListing(l)) {
    const sold = closedSalePrice(l)
    if (sold != null && sold > 0) return sold
  }
  return l.price != null && l.price > 0 ? l.price : null
}

function zipAggregateKey(zip: string, listing: Listing): string {
  return `${zip}::${kindOf(listing)}`
}

export function buildZipAggregates(listings: readonly Listing[]): Map<string, ZipAggregate> {
  const groups = new Map<string, { ppsfs: number[]; sqfts: number[] }>()

  for (const listing of listings) {
    const zip = normalizeZip(listing.address.postalCode)
    if (!zip) continue
    const key = zipAggregateKey(zip, listing)
    if (!groups.has(key)) groups.set(key, { ppsfs: [], sqfts: [] })
    const group = groups.get(key)!
    const price = referencePrice(listing)
    if (price != null && listing.sqft != null && listing.sqft > 0) {
      group.ppsfs.push(price / listing.sqft)
    }
    if (listing.sqft != null && listing.sqft > 0) {
      group.sqfts.push(listing.sqft)
    }
  }

  const out = new Map<string, ZipAggregate>()
  for (const [key, group] of groups) {
    out.set(key, {
      medianPpsf: median(group.ppsfs),
      medianSqft: median(group.sqfts),
      topPpsf15: percentile(group.ppsfs, 0.85),
      bottomPpsf15: percentile(group.ppsfs, 0.15),
    })
  }
  return out
}

async function readCachedFinishQualityTier(mlsId: string): Promise<FinishQualityTier | null> {
  const row = await readStatsCacheRow(`${FINISH_QUALITY_CACHE_PREFIX}:${mlsId.trim()}`)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.payload) as { tier?: string }
    const tier = parsed.tier?.trim() as FinishQualityTier | undefined
    if (!tier || !(tier in FINISH_TIER_SCORES)) return null
    return tier
  } catch {
    return null
  }
}

function scoreLocation(listing: Listing): number {
  const premium = computeLocationPremium(
    listing.latitude,
    listing.longitude,
    listing.address.postalCode,
    listing.address.city,
  )
  const multiplier = premium.combinedMultiplier
  if (multiplier <= 1) return 52
  const boost = (multiplier - 1) / 0.22
  return clamp(52 + boost * 48)
}

function scoreAge(yearBuilt: number | null): number {
  if (yearBuilt != null && yearBuilt >= 2015) return 92
  if (yearBuilt != null && yearBuilt >= 2000) return 68
  if (yearBuilt != null && yearBuilt >= 1980) return 42
  if (yearBuilt != null) return 28
  return 50
}

function scoreSize(sqft: number | null, zipMedianSqft: number | null): number {
  if (sqft == null || sqft <= 0 || zipMedianSqft == null || zipMedianSqft <= 0) {
    return 50
  }
  const ratio = sqft / zipMedianSqft
  if (ratio >= 1.35) return 88
  if (ratio >= 1.15) return 78
  if (ratio >= 0.9) return 68
  if (ratio >= 0.75) return 52
  return 36
}

function scoreLayout(
  sqft: number | null,
  beds: number | null,
  baths: number | null,
  goodLayout: string[],
  badLayout: string[],
): number {
  let score = 50
  if (sqft != null && beds != null && beds > 0) {
    const perBed = sqft / beds
    if (perBed >= 550) score += 10
    else if (perBed >= 450) score += 6
    else if (perBed < 300) score -= 8
  }
  if (beds != null && beds >= 3 && baths != null && baths >= 2) score += 10
  score += Math.min(goodLayout.length * 6, 20)
  score -= badLayout.length * 8
  return clamp(score)
}

function scoreConditionFromRemarks(remarks: string): number {
  const reno = matched(remarks, RENO_KEYWORDS)
  const lowQuality = matched(remarks, LOW_QUALITY_KEYWORDS)
  const downgrade = matched(remarks, CONDITION_DOWNGRADE_KEYWORDS)
  let score = 50
  score += Math.min(reno.length * 12, 45)
  score -= lowQuality.length * 12
  score -= downgrade.length * 12
  return clamp(score)
}

function scoreCondition(
  listing: Listing,
  remarks: string,
  finishTier: FinishQualityTier | null,
): { score: number; source: EdgeScoreMetadataSnapshot['conditionSource'] } {
  const remarksScore = scoreConditionFromRemarks(remarks)
  if (finishTier) {
    const finishScore = FINISH_TIER_SCORES[finishTier]
    return {
      score: clamp(remarksScore * 0.35 + finishScore * 0.65),
      source: remarksScore !== 50 ? 'mixed' : 'finish-quality',
    }
  }
  if (remarksScore !== 50) {
    return { score: remarksScore, source: 'remarks' }
  }
  return { score: remarksScore, source: 'default' }
}

function scoreValue(
  ppsf: number | null,
  zipAgg: ZipAggregate | null,
): number {
  if (ppsf == null || zipAgg?.medianPpsf == null || zipAgg.medianPpsf <= 0) {
    return 50
  }
  const ratio = ppsf / zipAgg.medianPpsf
  if (zipAgg.topPpsf15 != null && ppsf >= zipAgg.topPpsf15) return 25
  if (zipAgg.bottomPpsf15 != null && ppsf <= zipAgg.bottomPpsf15) return 30
  if (ratio <= 0.82) return 92
  if (ratio <= 0.92) return 82
  if (ratio <= 1.05) return 68
  if (ratio <= 1.15) return 52
  return 34
}

export function computeEdgeScoreForListing(
  listing: Listing,
  context: EdgeScoreContext,
): {
  edgeScore: number
  breakdown: EdgeScoreBreakdown
  metadata: EdgeScoreMetadataSnapshot
} {
  const zip = normalizeZip(listing.address.postalCode)
  const town = resolveListingTown(listing.address.city)
  const remarks = collectRemarks(listing)
  const goodLayout = matched(remarks, GOOD_LAYOUT_KEYWORDS)
  const badLayout = matched(remarks, BAD_LAYOUT_KEYWORDS)
  const finishTier = context.finishQualityByMlsId.get(listing.mlsId) ?? null
  const zipAgg = zip ? context.zipAggregates.get(zipAggregateKey(zip, listing)) ?? null : null
  const price = referencePrice(listing)
  const ppsf =
    price != null && listing.sqft != null && listing.sqft > 0
      ? price / listing.sqft
      : null

  const location = scoreLocation(listing)
  const age = scoreAge(listing.yearBuilt)
  const size = scoreSize(listing.sqft, zipAgg?.medianSqft ?? null)
  const layout = scoreLayout(listing.sqft, listing.beds, listing.baths, goodLayout, badLayout)
  const { score: condition, source: conditionSource } = scoreCondition(
    listing,
    remarks,
    finishTier,
  )
  const value = scoreValue(ppsf, zipAgg)

  const composite = clamp(
    location * WEIGHTS.location +
      age * WEIGHTS.age +
      size * WEIGHTS.size +
      layout * WEIGHTS.layout +
      condition * WEIGHTS.condition +
      value * WEIGHTS.value,
  )

  const round = (n: number) => Math.round(n * 10) / 10

  return {
    edgeScore: round(composite),
    breakdown: {
      location: round(location),
      age: round(age),
      size: round(size),
      layout: round(layout),
      condition: round(condition),
      value: round(value),
      composite: round(composite),
      weights: WEIGHTS,
      finishQualityTier: finishTier,
      zipMedianPpsf: zipAgg?.medianPpsf ?? null,
      zipMedianSqft: zipAgg?.medianSqft ?? null,
    },
    metadata: {
      town,
      zip,
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      yearBuilt: listing.yearBuilt,
      conditionSource,
    },
  }
}

async function buildEdgeScoreContext(
  listings: readonly Listing[],
): Promise<EdgeScoreContext> {
  const finishQualityByMlsId = new Map<string, FinishQualityTier | null>()
  for (const listing of listings) {
    finishQualityByMlsId.set(listing.mlsId, await readCachedFinishQualityTier(listing.mlsId))
  }
  return {
    zipAggregates: buildZipAggregates(listings),
    finishQualityByMlsId,
  }
}

export type ListingEdgeScoresRebuildResult = {
  startedAt: string
  finishedAt: string
  durationMs: number
  scored: number
}

/**
 * Score every Active + Closed listing from SQLite using metadata, zip benchmarks,
 * remarks, and cached finish-quality assessments (no per-request RETS or vision).
 */
export async function rebuildAllListingEdgeScores(): Promise<ListingEdgeScoresRebuildResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const [activePool, closedPool] = await Promise.all([
    readAllListingsFromDb(TMRE_TOWNS, 'Active'),
    readAllListingsFromDb(TMRE_TOWNS, 'Closed'),
  ])
  const pool = [...activePool, ...closedPool]
  const context = await buildEdgeScoreContext(pool)
  const computedAt = new Date().toISOString()

  const rows = pool
    .map((listing) => {
      const listingId = listingRowId(listing)
      const mlsId = listing.mlsId?.trim()
      if (!listingId || !mlsId) return null
      const { edgeScore, breakdown, metadata } = computeEdgeScoreForListing(
        listing,
        context,
      )
      return {
        mlsId,
        listingId,
        edgeScore,
        breakdownJson: JSON.stringify(breakdown),
        metadataSnapshot: JSON.stringify(metadata),
        computedAt,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const scored = await upsertListingEdgeScores(rows)
  setSyncMeta('edge_score_algo_version', String(EDGE_SCORE_ALGO_VERSION))
  setSyncMeta('last_listing_edge_scores', computedAt)
  const durationMs = Date.now() - t0
  console.info(
    `[listing-edge-scores] rebuilt ${scored} scores in ${durationMs}ms`,
  )

  return {
    startedAt,
    finishedAt: computedAt,
    durationMs,
    scored,
  }
}

let edgeScoreWarmRunning = false

/** Fire-and-forget edge score rebuild after full sync. */
export function warmListingEdgeScoresDeferred(): void {
  if (edgeScoreWarmRunning) return
  edgeScoreWarmRunning = true
  void (async () => {
    try {
      await new Promise((r) => setTimeout(r, 5_000))
      await rebuildAllListingEdgeScores()
    } catch (err) {
      console.error('[listing-edge-scores] deferred rebuild failed', err)
    } finally {
      edgeScoreWarmRunning = false
    }
  })()
}
