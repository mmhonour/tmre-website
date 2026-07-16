import 'server-only'

import { query } from '@/lib/db/postgres'
import { maxRowsForColumns } from '@/lib/db/chunked-upsert'

// ---------------------------------------------------------------------------
// listing_price_history — forward-only price/status change log.
//
// The sync write path (upsertTownListings / upsertListing) compares each
// incoming listing to the row currently stored in `listings` and, when the
// price and/or MLS status changed, hands the before/after here to be appended
// as one self-describing edge. A sequence of edges for a listing IS its ladder.
//
// This is deliberately BEST-EFFORT and runs OUTSIDE the sync transaction: a
// failure to log history must never roll back or break a listing sync. If the
// table is missing (migration 0003 not yet applied on this instance) we disable
// logging for the process after the first "relation does not exist" so we don't
// spam the sync logs.
// ---------------------------------------------------------------------------

export type ListingChangeKind = 'price' | 'status' | 'price_status'

export type ListingSnapshotEntry = {
  listingId: string
  mlsId: string
  town: string | null
  statusBucket: string
  /** MLS status AFTER the change. */
  status: string | null
  /** Price AFTER the change. */
  price: number | null
  /** MLS status BEFORE the change (null if unknown / brand-new row). */
  previousStatus: string | null
  /** Price BEFORE the change (null if unknown / brand-new row). */
  previousPrice: number | null
}

/**
 * Classify a price/status transition. Returns null when nothing we track
 * changed (so no row is written), or when there is no prior value to diff
 * against (a brand-new listing — its opening price is the baseline in
 * `listings`, not a "change").
 */
export function classifyListingChange(
  previous: { price: number | null; status: string | null } | null,
  next: { price: number | null; status: string | null },
): ListingChangeKind | null {
  if (!previous) return null
  const priceChanged =
    previous.price != null && next.price != null && previous.price !== next.price
  const normPrev = previous.status?.trim().toLowerCase() ?? null
  const normNext = next.status?.trim().toLowerCase() ?? null
  const statusChanged = normPrev != null && normNext != null && normPrev !== normNext
  if (priceChanged && statusChanged) return 'price_status'
  if (priceChanged) return 'price'
  if (statusChanged) return 'status'
  return null
}

const HISTORY_COLUMNS = [
  'listing_id',
  'mls_id',
  'town',
  'status_bucket',
  'mls_status',
  'price',
  'previous_status',
  'previous_price',
  'change_kind',
  'observed_at',
] as const

const HISTORY_ROWS_PER_STATEMENT = maxRowsForColumns(HISTORY_COLUMNS.length)

let loggingDisabled = false

function isMissingTableError(err: unknown): boolean {
  // Postgres undefined_table
  return (err as { code?: string })?.code === '42P01'
}

/**
 * Append change rows for the supplied entries. Best-effort: swallows and logs
 * errors, never throws. Entries whose change is untracked should be filtered by
 * the caller via {@link classifyListingChange}; anything passed here is written.
 */
export async function recordListingChanges(
  entries: Array<ListingSnapshotEntry & { changeKind: ListingChangeKind }>,
): Promise<void> {
  if (loggingDisabled || entries.length === 0) return

  const observedAt = new Date()
  const rows = entries.map((e) => [
    e.listingId,
    e.mlsId,
    e.town,
    e.statusBucket,
    e.status,
    e.price,
    e.previousStatus,
    e.previousPrice,
    e.changeKind,
    observedAt,
  ])

  const colList = HISTORY_COLUMNS.join(', ')
  try {
    for (let i = 0; i < rows.length; i += HISTORY_ROWS_PER_STATEMENT) {
      const chunk = rows.slice(i, i + HISTORY_ROWS_PER_STATEMENT)
      const values: unknown[] = []
      const tuples = chunk.map((row) => {
        const placeholders = row.map((val) => {
          values.push(val)
          return `$${values.length}`
        })
        return `(${placeholders.join(', ')})`
      })
      await query(
        `INSERT INTO listing_price_history (${colList}) VALUES ${tuples.join(', ')}`,
        values,
      )
    }
  } catch (err) {
    if (isMissingTableError(err)) {
      loggingDisabled = true
      console.warn(
        '[listing-history-log] listing_price_history missing — run migration 0003; history logging disabled for this process',
      )
      return
    }
    console.error('[listing-history-log] failed to record changes', err)
  }
}

export type ListingPriceHistoryRow = {
  id: string
  listingId: string
  mlsId: string
  town: string | null
  statusBucket: string
  status: string | null
  price: number | null
  previousStatus: string | null
  previousPrice: number | null
  changeKind: ListingChangeKind
  observedAt: string
}

/**
 * Read the recorded change ladder for a listing, oldest-first. Accepts either
 * the listing row id (listingKey||mlsId) or the MLS number; when both are given
 * they are OR-matched so relistings under a new MLS id still chain.
 */
export async function getListingPriceHistory(opts: {
  listingId?: string | null
  mlsId?: string | null
}): Promise<ListingPriceHistoryRow[]> {
  const listingId = opts.listingId?.trim() || null
  const mlsId = opts.mlsId?.trim() || null
  if (!listingId && !mlsId) return []

  try {
    const rows = await query<{
      id: string
      listing_id: string
      mls_id: string
      town: string | null
      status_bucket: string
      mls_status: string | null
      price: string | null
      previous_status: string | null
      previous_price: string | null
      change_kind: string
      observed_at: Date
    }>(
      `SELECT id, listing_id, mls_id, town, status_bucket, mls_status, price,
              previous_status, previous_price, change_kind, observed_at
         FROM listing_price_history
        WHERE ($1::text IS NOT NULL AND listing_id = $1)
           OR ($2::text IS NOT NULL AND mls_id = $2)
        ORDER BY observed_at ASC, id ASC`,
      [listingId, mlsId],
    )
    return rows.map((r) => ({
      id: String(r.id),
      listingId: r.listing_id,
      mlsId: r.mls_id,
      town: r.town,
      statusBucket: r.status_bucket,
      status: r.mls_status,
      price: r.price != null ? Number(r.price) : null,
      previousStatus: r.previous_status,
      previousPrice: r.previous_price != null ? Number(r.previous_price) : null,
      changeKind: r.change_kind as ListingChangeKind,
      observedAt:
        r.observed_at instanceof Date ? r.observed_at.toISOString() : String(r.observed_at),
    }))
  } catch (err) {
    if (isMissingTableError(err)) return []
    console.error('[listing-history-log] read failed', err)
    return []
  }
}
