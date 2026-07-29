import 'server-only'

import { query } from '@/lib/db/postgres'
import {
  ACTIVE_MLS_STATUS,
  COMING_SOON_MLS_STATUS,
  UNDER_CONTRACT_CTS_MLS_STATUS,
  UNDER_CONTRACT_MLS_STATUS,
  getActiveListingsFetchLimit,
  searchMarketListingsForTown,
} from '@/lib/listings-store'
import type { TmreTown } from '@/lib/tmre-towns'

/**
 * MLS statuses that land in the Postgres `status_bucket = 'Active'` bucket.
 * The DB side of the comparison is that bucket, so the MLS side must be the
 * union of exactly these statuses — anything less reports phantom staleness.
 */
export const RECONCILE_MLS_STATUSES = [
  ACTIVE_MLS_STATUS,
  COMING_SOON_MLS_STATUS,
  UNDER_CONTRACT_MLS_STATUS,
  UNDER_CONTRACT_CTS_MLS_STATUS,
] as const

/** Per-list response cap so one bad town cannot return a giant payload. */
export const RECONCILE_LIST_CAP = 25

export type ReconcileListingRef = {
  mlsId: string
  address: string | null
  price: number | null
  mlsStatus: string | null
}

export type ReconcileGap = {
  /** Full size of the gap, even when `listings` is capped. */
  total: number
  listings: ReconcileListingRef[]
}

export type ReconcileStatusError = { status: string; message: string }

export type TownReconciliation = {
  town: TmreTown
  /** Distinct MLS numbers in the live MLS Active-bucket set for this town. */
  mlsCount: number
  /** Rows with status_bucket = 'Active' for this town in Postgres. */
  dbCount: number
  /** In the MLS but not in Postgres — buyers can find these elsewhere, not here. */
  missingFromDb: ReconcileGap
  /** Active in Postgres but gone from the MLS Active set — sold/expired, never caught. */
  staleInDb: ReconcileGap
  ok: boolean
  durationMs: number
  checkedAt: string
  fetchLimit: number
  mlsStatuses: string[]
  /** Non-fatal per-status RETS failures — a partial MLS set inflates staleInDb. */
  statusErrors: ReconcileStatusError[]
}

function normalizeMlsId(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function toPrice(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function capped(refs: ReconcileListingRef[]): ReconcileGap {
  return { total: refs.length, listings: refs.slice(0, RECONCILE_LIST_CAP) }
}

/**
 * Compare the live MLS Active set against Postgres for one town, by MLS number.
 *
 * Deliberately compares set membership only — never dates. MLS "status change"
 * vs "list date" mean different things and stored timestamps have carried a
 * timezone bug, so date-based freshness checks have produced false diagnoses.
 *
 * Read-only: no upserts, no sync_meta writes, no cache writes.
 */
export async function reconcileTownInventory(
  town: TmreTown,
): Promise<TownReconciliation> {
  const startedAt = Date.now()
  const fetchLimit = getActiveListingsFetchLimit()
  const statusErrors: ReconcileStatusError[] = []

  // MLS side: no `modifiedAfter`, so this is the full current set per status
  // (that path unions the city search with per-zip searches).
  const mlsByMlsId = new Map<string, ReconcileListingRef>()
  // Sequential per status: each RETS search logs in and already fans out across
  // the town's zips, so running the four statuses in parallel would multiply
  // concurrent SmartMLS logins by four.
  for (const status of RECONCILE_MLS_STATUSES) {
    try {
      const listings = await searchMarketListingsForTown(town, status, fetchLimit)
      for (const listing of listings) {
        const mlsId = normalizeMlsId(listing.mlsId)
        if (!mlsId || mlsByMlsId.has(mlsId)) continue
        mlsByMlsId.set(mlsId, {
          mlsId,
          address: listing.address?.full || listing.address?.street || null,
          price: toPrice(listing.price),
          mlsStatus: listing.status || status,
        })
      }
    } catch (err) {
      statusErrors.push({
        status,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const dbRows = await query<{
    mls_id: string
    address_full: string | null
    price: string | number | null
    mls_status: string | null
  }>(
    `SELECT mls_id, address_full, price, mls_status
       FROM listings
      WHERE status_bucket = 'Active' AND town = $1`,
    [town],
  )

  const dbByMlsId = new Map<string, ReconcileListingRef>()
  for (const row of dbRows) {
    const mlsId = normalizeMlsId(row.mls_id)
    if (!mlsId || dbByMlsId.has(mlsId)) continue
    dbByMlsId.set(mlsId, {
      mlsId,
      address: row.address_full,
      price: toPrice(row.price),
      mlsStatus: row.mls_status,
    })
  }

  const missing: ReconcileListingRef[] = []
  for (const [mlsId, ref] of mlsByMlsId) {
    if (!dbByMlsId.has(mlsId)) missing.push(ref)
  }
  const stale: ReconcileListingRef[] = []
  for (const [mlsId, ref] of dbByMlsId) {
    if (!mlsByMlsId.has(mlsId)) stale.push(ref)
  }

  return {
    town,
    mlsCount: mlsByMlsId.size,
    dbCount: dbByMlsId.size,
    missingFromDb: capped(missing),
    staleInDb: capped(stale),
    ok: missing.length === 0 && stale.length === 0,
    durationMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    fetchLimit,
    mlsStatuses: [...RECONCILE_MLS_STATUSES],
    statusErrors,
  }
}
