import 'server-only'

import {
  computeAndPersistComparables,
  readCachedComparables,
} from '@/lib/listing-comparables-cache'
import {
  findComparablesRanked,
  subjectComparablesCriteria,
  type ComparablesMatchMode,
} from '@/lib/listing-comparables'
import type { ComparablesResult } from '@/lib/listing-comparables-shared'
import {
  COMPARABLES_MAX_LOOKBACK_MONTHS,
  COMPARABLES_SOLD_SUPERSET_LIMIT,
} from '@/lib/listing-comparables-shared'
import { widePricingMatchingConfig } from '@/lib/listing-comparables-session'
import {
  readAllListingsFromDb,
  readListingEdgeScoresByMlsIds,
} from '@/lib/db/listings-repo'
import { getPricingMatchingConfigFresh } from '@/lib/pricing-matching-config'
import type { PricingMatchingConfig } from '@/lib/pricing-matching-config-shared'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, townForZip } from '@/lib/tmre-towns'

export type ComparablesApiPayload = ComparablesResult & {
  mlsId: string
  kind: ComparablesMatchMode
  /** Admin Pricing defaults — seed session +/- controls. */
  matchConfig: PricingMatchingConfig
}

async function attachStoredEdgeScores(
  result: ComparablesResult,
): Promise<ComparablesResult> {
  const mlsIds = [...result.sold, ...result.active]
    .map((c) => c.mlsId.trim())
    .filter(Boolean)
  if (mlsIds.length === 0) return result
  const stored = await readListingEdgeScoresByMlsIds(mlsIds)
  if (stored.size === 0) return result

  const attach = (comps: typeof result.sold) =>
    comps.map((comp) => {
      const row = stored.get(comp.mlsId.trim())
      const score = row?.edgeScore ?? null
      return {
        ...comp,
        edgeScore: score != null && score > 0 ? score : null,
      }
    })

  return {
    ...result,
    sold: attach(result.sold),
    active: attach(result.active),
  }
}

async function loadTownPools(subject: Listing): Promise<{
  soldPool: Listing[]
  activePool: Listing[]
}> {
  const townFromZip = townForZip(subject.address.postalCode)
  const towns = townFromZip ? [townFromZip] : [...TMRE_TOWNS]
  const [soldPool, activePool] = await Promise.all([
    readAllListingsFromDb(towns, 'Closed'),
    readAllListingsFromDb(towns, 'Active'),
  ])
  return { soldPool, activePool }
}

/**
 * Live wide pool for interactive criteria +/- (not written to relation cache).
 * Uses max bed/bath/% bands so the client can filter down to session overrides.
 */
async function resolveWideComparablesPool(
  subject: Listing,
  kind: ComparablesMatchMode,
  match: PricingMatchingConfig,
): Promise<ComparablesApiPayload> {
  const { soldPool, activePool } = await loadTownPools(subject)
  const wide = widePricingMatchingConfig(match)
  const ranked = findComparablesRanked(subject, soldPool, activePool, kind, {
    soldLookbackMonths: COMPARABLES_MAX_LOOKBACK_MONTHS,
    soldLimit: COMPARABLES_SOLD_SUPERSET_LIMIT,
    match: wide,
    relaxVintage: true,
  })
  const result: ComparablesResult = {
    sold: ranked.sold.map((row) => row.listing),
    active: ranked.active.map((row) => row.listing),
    // Keep subject criteria labels from admin edge rule (session seeds from this).
    criteria: ranked.criteria,
    missingCriteria: ranked.missingCriteria,
    defaultLookbackMonths: match.defaultLookbackMonths,
  }
  // Keep admin Pricing criteria (vintage edge labels) for session seeding.
  const adminCriteria = subjectComparablesCriteria(subject, match)
  if (adminCriteria.criteria) {
    result.criteria = adminCriteria.criteria
    result.missingCriteria = adminCriteria.missingCriteria
  }
  const withScores = await attachStoredEdgeScores(result)
  return {
    mlsId: subject.mlsId,
    kind,
    ...withScores,
    matchConfig: match,
  }
}

export async function resolveComparablesForSubject(
  subject: Listing,
  kind: ComparablesMatchMode = 'sale',
  options: { pool?: 'default' | 'wide' } = {},
): Promise<ComparablesApiPayload> {
  const match = await getPricingMatchingConfigFresh()

  if (options.pool === 'wide') {
    return resolveWideComparablesPool(subject, kind, match)
  }

  const cached = await readCachedComparables(subject, kind)
  if (cached) {
    const withScores = await attachStoredEdgeScores(cached)
    return {
      mlsId: subject.mlsId,
      kind,
      ...withScores,
      defaultLookbackMonths:
        withScores.defaultLookbackMonths ?? match.defaultLookbackMonths,
      matchConfig: match,
    }
  }

  const { soldPool, activePool } = await loadTownPools(subject)
  const result = await computeAndPersistComparables(
    subject,
    kind,
    soldPool,
    activePool,
  )

  const withScores = await attachStoredEdgeScores(result)

  return {
    mlsId: subject.mlsId,
    kind,
    ...withScores,
    matchConfig: match,
  }
}
