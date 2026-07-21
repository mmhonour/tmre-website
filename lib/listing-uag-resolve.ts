import 'server-only'

import {
  findUagRanked,
  subjectComparablesCriteria,
} from '@/lib/listing-comparables'
import type {
  ComparableListing,
  ComparablesCriteria,
} from '@/lib/listing-comparables-shared'
import { widePricingMatchingConfig } from '@/lib/listing-comparables-session'
import {
  listingRowId,
  readListingEdgeScoresByMlsIds,
} from '@/lib/db/listings-repo'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import {
  getPricingMatchingConfigFresh,
  pricingMatchingConfigFingerprint,
} from '@/lib/pricing-matching-config'
import type { PricingMatchingConfig } from '@/lib/pricing-matching-config-shared'
import { isRetsConfigured, searchListings, type Listing } from '@/lib/rets'
import { normalizeZip } from '@/lib/tmre-towns'

// ---------------------------------------------------------------------------
// UAG (Under Agreement) resolver — on-demand.
//
// UAG comps are NOT bulk-synced. When a subject is viewed we fetch the pool of
// under-contract listings for its zip live from RETS, match locally, and cache
// the (small) per-subject result in stats_cache with a short TTL. The zip-level
// RETS pool is intentionally left to rets.ts's in-process 5-minute cache rather
// than persisted to Postgres, so popular homes warm naturally within a process
// while Neon writes stay tiny (only ≤ a couple dozen slim comp rows per
// subject — no `raw` MLS blobs).
// ---------------------------------------------------------------------------

/** Bump to invalidate every cached UAG result after a matching-logic change. */
const UAG_CACHE_VERSION = 4

/** How long a per-subject UAG result stays fresh before we re-query RETS. */
const UAG_RESULT_TTL_MS = 12 * 60 * 60 * 1000

/** Cap on under-contract rows pulled per status per zip. */
const UAG_FETCH_LIMIT = 250

export type UagResult = {
  sale: ComparableListing[]
  rental: ComparableListing[]
  criteria: ComparablesCriteria | null
  missingCriteria: string[]
}

export type UagPayload = UagResult & {
  mlsId: string
  /** Admin Pricing match defaults — seeds the Criteria ± panel. */
  matchConfig?: PricingMatchingConfig
}

function uagCacheKey(subjectId: string, matchFp: string): string {
  return `uag:v${UAG_CACHE_VERSION}:${subjectId}:${matchFp}`
}

function isFresh(computedAtIso: string, ttlMs: number): boolean {
  const t = Date.parse(computedAtIso)
  if (Number.isNaN(t)) return false
  return Date.now() - t < ttlMs
}

/** Dedupe a merged pool of listings by their stable identity. */
function dedupeListings(listings: Listing[]): Listing[] {
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const l of listings) {
    const id = listingRowId(l) || l.mlsId?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(l)
  }
  return out
}

/**
 * Fetch the under-contract pool for a zip (both SmartMLS under-contract
 * statuses), leaning on rets.ts's in-process search cache for reuse.
 */
async function fetchUnderContractPoolForZip(zip: string): Promise<Listing[]> {
  if (!zip || !isRetsConfigured()) return []
  const [uc, cts] = await Promise.all([
    searchListings({
      zip,
      status: 'under contract',
      limit: UAG_FETCH_LIMIT,
    }).catch(() => [] as Listing[]),
    searchListings({
      zip,
      status: 'under contract - continue to show',
      limit: UAG_FETCH_LIMIT,
    }).catch(() => [] as Listing[]),
  ])
  return dedupeListings([...uc, ...cts])
}

/** Best-effort: overlay stored edge scores onto the comp rows when available. */
async function attachStoredEdgeScores(result: UagResult): Promise<UagResult> {
  const mlsIds = [...result.sale, ...result.rental]
    .map((c) => c.mlsId.trim())
    .filter(Boolean)
  if (mlsIds.length === 0) return result

  let stored: Awaited<ReturnType<typeof readListingEdgeScoresByMlsIds>>
  try {
    stored = await readListingEdgeScoresByMlsIds(mlsIds)
  } catch {
    return result
  }
  if (stored.size === 0) return result

  const attach = (comps: ComparableListing[]) =>
    comps.map((comp) => {
      const row = stored.get(comp.mlsId.trim())
      const score = row?.edgeScore ?? null
      return { ...comp, edgeScore: score != null && score > 0 ? score : null }
    })

  return { ...result, sale: attach(result.sale), rental: attach(result.rental) }
}

/**
 * Live wide pool for interactive Criteria ± (not written to stats_cache).
 * Uses max bed/bath/% bands so the client can filter down to session overrides.
 */
async function resolveWideUagPool(
  subject: Listing,
  match: PricingMatchingConfig,
): Promise<UagPayload> {
  const zip = normalizeZip(subject.address.postalCode)
  const pool = zip ? await fetchUnderContractPoolForZip(zip) : []
  const wide = widePricingMatchingConfig(match)
  const ranked = findUagRanked(subject, pool, wide)
  const result: UagResult = {
    sale: ranked.sale.map((r) => r.listing),
    rental: ranked.rental.map((r) => r.listing),
    criteria: ranked.criteria,
    missingCriteria: ranked.missingCriteria,
  }
  // Keep admin Pricing criteria (vintage edge labels) for session seeding.
  const adminCriteria = subjectComparablesCriteria(subject, match)
  if (adminCriteria.criteria) {
    result.criteria = adminCriteria.criteria
    result.missingCriteria = adminCriteria.missingCriteria
  }
  const withScores = await attachStoredEdgeScores(result)
  return { mlsId: subject.mlsId, ...withScores, matchConfig: match }
}

/**
 * Resolve under-agreement comps for a subject: cache-first, then on-demand RETS.
 * The heavy `Listing.raw` payloads never touch Postgres — only the slim comp
 * rows are cached.
 */
export async function resolveUagForSubject(
  subject: Listing,
  options: { pool?: 'default' | 'wide' } = {},
): Promise<UagPayload> {
  const subjectId = listingRowId(subject)
  const match = await getPricingMatchingConfigFresh()

  if (options.pool === 'wide') {
    return resolveWideUagPool(subject, match)
  }

  const matchFp = pricingMatchingConfigFingerprint(match)

  if (subjectId) {
    try {
      const cached = await readStatsCacheRow(uagCacheKey(subjectId, matchFp))
      if (cached && isFresh(cached.computedAt, UAG_RESULT_TTL_MS)) {
        const parsed = JSON.parse(cached.payload) as UagResult
        const withScores = await attachStoredEdgeScores(parsed)
        return { mlsId: subject.mlsId, ...withScores, matchConfig: match }
      }
    } catch {
      // Cache miss / parse failure falls through to a fresh compute.
    }
  }

  const zip = normalizeZip(subject.address.postalCode)
  const pool = zip ? await fetchUnderContractPoolForZip(zip) : []
  const ranked = findUagRanked(subject, pool, match)

  const result: UagResult = {
    sale: ranked.sale.map((r) => r.listing),
    rental: ranked.rental.map((r) => r.listing),
    criteria: ranked.criteria,
    missingCriteria: ranked.missingCriteria,
  }

  if (subjectId) {
    try {
      await writeStatsCacheRow(uagCacheKey(subjectId, matchFp), result)
    } catch {
      // Non-fatal: serve the freshly computed result even if the write fails.
    }
  }

  const withScores = await attachStoredEdgeScores(result)
  return { mlsId: subject.mlsId, ...withScores, matchConfig: match }
}
