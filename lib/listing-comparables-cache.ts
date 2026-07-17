import 'server-only'

import {
  findComparablesRanked,
  subjectComparablesCriteria,
  type ComparablesMatchMode,
  type RankedComparable,
} from '@/lib/listing-comparables'
import {
  COMPARABLES_MAX_LOOKBACK_MONTHS,
  COMPARABLES_SOLD_SUPERSET_LIMIT,
  type ComparableListing,
  type ComparablesResult,
} from '@/lib/listing-comparables-shared'
import { listingRowId } from '@/lib/db/listings-repo'
import {
  readAllListingsFromDb,
  readListingRelations,
  readListingsFromDb,
  replaceListingRelationsForSubject,
  type ListingRelationKind,
  type ListingRelationRow,
} from '@/lib/db/listings-repo'
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import {
  getPricingMatchingConfig,
  getPricingMatchingConfigFresh,
  isDefaultPricingMatchingConfig,
  pricingMatchingConfigFingerprint,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, townForZip, type TmreTown } from '@/lib/tmre-towns'

const COMPS_EDGES_MATCH_FP_KEY = 'comps_edges_match_fp'

/** Bump when matcher tolerances / ranking change so cached edges rebuild. */
export const COMPS_EDGES_ALGO_VERSION = 4

function relationsForKind(kind: ComparablesMatchMode): ListingRelationKind[] {
  return kind === 'rental'
    ? ['rental_sold', 'rental_active']
    : ['comp_sold', 'comp_active']
}

function soldRelation(kind: ComparablesMatchMode): ListingRelationKind {
  return kind === 'rental' ? 'rental_sold' : 'comp_sold'
}

function activeRelation(kind: ComparablesMatchMode): ListingRelationKind {
  return kind === 'rental' ? 'rental_active' : 'comp_active'
}

function parseComparablePayload(payload: string): ComparableListing | null {
  try {
    const parsed = JSON.parse(payload) as ComparableListing
    if (!parsed?.mlsId) return null
    return parsed
  } catch {
    return null
  }
}

const EMPTY_RELATED_ID = '_none_'

function emptyRelationSentinel(
  subjectId: string,
  relation: ListingRelationKind,
  computedAt: string,
): ListingRelationRow {
  return {
    subjectId,
    relatedId: EMPTY_RELATED_ID,
    relation,
    rank: 0,
    score: null,
    payload: '{}',
    computedAt,
  }
}

function rankedToRelationRows(
  subjectId: string,
  kind: ComparablesMatchMode,
  sold: RankedComparable[],
  active: RankedComparable[],
  computedAt: string,
): ListingRelationRow[] {
  const soldRel = soldRelation(kind)
  const activeRel = activeRelation(kind)
  const rows: ListingRelationRow[] = []

  for (const row of sold) {
    const relatedId = row.listing.listingKey?.trim() || row.listing.mlsId
    if (!relatedId) continue
    rows.push({
      subjectId,
      relatedId,
      relation: soldRel,
      rank: row.rank,
      score: row.fitDistance,
      payload: JSON.stringify(row.listing),
      computedAt,
    })
  }
  for (const row of active) {
    const relatedId = row.listing.listingKey?.trim() || row.listing.mlsId
    if (!relatedId) continue
    rows.push({
      subjectId,
      relatedId,
      relation: activeRel,
      rank: row.rank,
      score: row.fitDistance,
      payload: JSON.stringify(row.listing),
      computedAt,
    })
  }

  // Persist both sides even when only one has matches — older builds skipped sold
  // rows when active comps existed, which froze "Recently sold" empty forever.
  if (sold.length === 0) rows.push(emptyRelationSentinel(subjectId, soldRel, computedAt))
  if (active.length === 0) rows.push(emptyRelationSentinel(subjectId, activeRel, computedAt))

  return rows
}

function relationRowsForKind(
  rows: ListingRelationRow[],
  relation: ListingRelationKind,
): ListingRelationRow[] {
  return rows.filter((row) => row.relation === relation)
}

function hasBothRelationKinds(
  rows: ListingRelationRow[],
  kind: ComparablesMatchMode,
): boolean {
  return (
    relationRowsForKind(rows, soldRelation(kind)).length > 0 &&
    relationRowsForKind(rows, activeRelation(kind)).length > 0
  )
}

function soldSentinelIsStale(
  rows: ListingRelationRow[],
  kind: ComparablesMatchMode,
): boolean {
  const soldRows = relationRowsForKind(rows, soldRelation(kind))
  if (soldRows.length === 0) return true
  const onlySentinel = soldRows.every((row) => row.relatedId === EMPTY_RELATED_ID)
  if (!onlySentinel) return false

  const lastFull = getSyncMeta('last_full_sync')
  if (!lastFull) return false

  const computedAt = soldRows.reduce(
    (min, row) => (row.computedAt < min ? row.computedAt : min),
    soldRows[0]!.computedAt,
  )
  return computedAt < lastFull
}

/**
 * True when stored edges were built under the current Admin Pricing match
 * rules. Edges written before Pricing existed have no fingerprint — treat
 * those as fresh while config is still the built-in defaults so we don't
 * force every listing to re-rank town-wide pools on first page view.
 */
function edgesMatchPricingConfig(match: PricingMatchingConfig): boolean {
  const expected = pricingMatchingConfigFingerprint(match)
  const stored = getSyncMeta(COMPS_EDGES_MATCH_FP_KEY)
  if (stored === expected) return true
  if (stored == null && isDefaultPricingMatchingConfig(match)) {
    // Backfill so later reads (and other Lambdas after sync_meta hydrate) hit
    // the fast equality path.
    setSyncMeta(COMPS_EDGES_MATCH_FP_KEY, expected)
    return true
  }
  return false
}

function edgesAreFresh(
  rows: ListingRelationRow[],
  match: PricingMatchingConfig,
): boolean {
  if (getSyncMeta('comps_edges_algo_version') !== String(COMPS_EDGES_ALGO_VERSION)) {
    return false
  }
  if (!edgesMatchPricingConfig(match)) return false
  if (rows.length === 0) return false
  const lastFull = getSyncMeta('last_full_sync')
  if (!lastFull) return true
  const computedAt = rows.reduce(
    (min, row) => (row.computedAt < min ? row.computedAt : min),
    rows[0]!.computedAt,
  )
  // Edges written before the latest full inventory rebuild are stale.
  return computedAt >= lastFull
}

function rowsToResult(
  rows: ListingRelationRow[],
  kind: ComparablesMatchMode,
  base: Pick<ComparablesResult, 'criteria' | 'missingCriteria'>,
): ComparablesResult {
  const soldRel = soldRelation(kind)
  const activeRel = activeRelation(kind)
  const sold: ComparableListing[] = []
  const active: ComparableListing[] = []

  for (const row of rows) {
    if (row.relatedId === EMPTY_RELATED_ID) continue
    const listing = parseComparablePayload(row.payload)
    if (!listing) continue
    if (row.relation === soldRel) sold.push(listing)
    else if (row.relation === activeRel) active.push(listing)
  }

  return {
    sold,
    active,
    criteria: base.criteria,
    missingCriteria: base.missingCriteria,
  }
}

export async function readCachedComparables(
  subject: Listing,
  kind: ComparablesMatchMode = 'sale',
): Promise<ComparablesResult | null> {
  const subjectId = listingRowId(subject)
  if (!subjectId) return null

  const match = await getPricingMatchingConfigFresh()
  const relations = relationsForKind(kind)
  const rows = await readListingRelations(subjectId, relations)
  if (!edgesAreFresh(rows, match)) return null
  if (!hasBothRelationKinds(rows, kind)) return null
  if (soldSentinelIsStale(rows, kind)) return null

  const { criteria, missingCriteria } = subjectComparablesCriteria(
    subject,
    match,
  )
  return {
    ...rowsToResult(rows, kind, { criteria, missingCriteria }),
    defaultLookbackMonths: match.defaultLookbackMonths,
  }
}

/** Compute ranked comps, persist edges, and return the panel payload (unscores). */
export async function computeAndPersistComparables(
  subject: Listing,
  kind: ComparablesMatchMode,
  soldPool: Listing[],
  activePool: Listing[],
): Promise<ComparablesResult> {
  const subjectId = listingRowId(subject)
  const match =
    (await getPricingMatchingConfigFresh().catch(() => null)) ??
    getPricingMatchingConfig()
  // Cache the widest look-back window with a larger reservoir so every shorter
  // window the user picks filters instantly from this one fit-ranked superset.
  const ranked = findComparablesRanked(subject, soldPool, activePool, kind, {
    soldLookbackMonths: COMPARABLES_MAX_LOOKBACK_MONTHS,
    soldLimit: COMPARABLES_SOLD_SUPERSET_LIMIT,
    match,
  })
  if (!subjectId) {
    return {
      sold: ranked.sold.map((row) => row.listing),
      active: ranked.active.map((row) => row.listing),
      criteria: ranked.criteria,
      missingCriteria: ranked.missingCriteria,
      defaultLookbackMonths: match.defaultLookbackMonths,
    }
  }

  const computedAt = new Date().toISOString()
  const relationKinds = relationsForKind(kind)
  const rows = rankedToRelationRows(
    subjectId,
    kind,
    ranked.sold,
    ranked.active,
    computedAt,
  )
  await replaceListingRelationsForSubject(subjectId, relationKinds, rows)
  setSyncMeta('comps_edges_algo_version', String(COMPS_EDGES_ALGO_VERSION))
  setSyncMeta(COMPS_EDGES_MATCH_FP_KEY, pricingMatchingConfigFingerprint(match))

  return {
    sold: ranked.sold.map((row) => row.listing),
    active: ranked.active.map((row) => row.listing),
    criteria: ranked.criteria,
    missingCriteria: ranked.missingCriteria,
    defaultLookbackMonths: match.defaultLookbackMonths,
  }
}

function townsForSubject(subject: Listing): TmreTown[] {
  const townFromZip = townForZip(subject.address.postalCode)
  return townFromZip ? [townFromZip] : [...TMRE_TOWNS]
}

/** Persist sale + rental comparable edges for one active listing. */
export async function persistComparableEdgesForListing(subject: Listing): Promise<void> {
  const towns = townsForSubject(subject)
  const [soldPool, activePool] = await Promise.all([
    readAllListingsFromDb(towns, 'Closed'),
    readAllListingsFromDb(towns, 'Active'),
  ])
  await computeAndPersistComparables(subject, 'sale', soldPool, activePool)
  await computeAndPersistComparables(subject, 'rental', soldPool, activePool)
}

/**
 * Rebuild ranked comparable edges for every Active listing.
 * Intended to run during the full MLS sync after If-estimate rebuild.
 */
export async function rebuildComparableEdges(options: {
  limitPerTown?: number
} = {}): Promise<{ subjects: number; edges: number; durationMs: number }> {
  const t0 = Date.now()
  const limitPerTown = options.limitPerTown ?? 500
  let subjects = 0
  let edges = 0

  for (const town of TMRE_TOWNS) {
    const active = (await readListingsFromDb(town, 'Active')).slice(0, limitPerTown)
    if (active.length === 0) continue
    const soldPool = await readAllListingsFromDb([town], 'Closed')
    const activePool = await readAllListingsFromDb([town], 'Active')

    for (const subject of active) {
      const sale = await computeAndPersistComparables(
        subject,
        'sale',
        soldPool,
        activePool,
      )
      const rental = await computeAndPersistComparables(
        subject,
        'rental',
        soldPool,
        activePool,
      )
      subjects += 1
      edges +=
        sale.sold.length +
        sale.active.length +
        rental.sold.length +
        rental.active.length
    }
  }

  const finishedAt = new Date().toISOString()
  setSyncMeta('comps_edges_algo_version', String(COMPS_EDGES_ALGO_VERSION))
  setSyncMeta('last_comps_edges', finishedAt)
  const durationMs = Date.now() - t0
  console.info(
    `[comps-edges] rebuilt ${subjects} subjects / ${edges} edges in ${durationMs}ms`,
  )
  return { subjects, edges, durationMs }
}

let compsWarmRunning = false

/** Fire-and-forget rebuild after sync so page requests stay on SQLite edges. */
export function warmComparableEdgesDeferred(): void {
  if (compsWarmRunning) return
  compsWarmRunning = true
  void (async () => {
    try {
      await new Promise((r) => setTimeout(r, 3_000))
      await rebuildComparableEdges()
    } catch (err) {
      console.error('[comps-edges] deferred rebuild failed', err)
    } finally {
      compsWarmRunning = false
    }
  })()
}
