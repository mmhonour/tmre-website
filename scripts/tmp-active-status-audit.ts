/**
 * Audit every Postgres `status_bucket = 'Active'` row against the live MLS and
 * report which ones are no longer in the MLS Active family, plus what the MLS
 * says they actually are now (Withdrawn / Expired / Pending / Closed / …).
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/tmp-active-status-audit.ts [focusMlsId ...]
 *
 * Read-only: no upserts, no sync_meta writes, no cache writes.
 */
import { query } from '../lib/db/postgres'
import { getListingByMlsId, searchListings, type Listing } from '../lib/rets'
import { searchMarketListingsForTown } from '../lib/listings-store'
import { TMRE_TOWNS, type TmreTown } from '../lib/tmre-towns'

/** Statuses that legitimately live in the Active bucket. */
const ACTIVE_FAMILY = [
  'Active',
  'Coming Soon',
  'Under Contract',
  'Under Contract - Continue to Show',
] as const

/** Bulk classification pulls for the stale set (cheap: one search per town). */
const OFF_MARKET_BULK = ['Withdrawn', 'Expired', 'Pending'] as const

const FETCH_LIMIT = 2500
/** Per-MLS RETS lookups are one login each — cap the tail. */
const UNKNOWN_LOOKUP_CAP = 80

type DbRow = {
  mls_id: string
  town: string
  address_full: string | null
  price: string | number | null
  mls_status: string | null
  modification_timestamp: string | null
  status_change_timestamp: string | null
  synced_at: string | null
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.round((Date.now() - ms) / 86_400_000)
}

function age(iso: string | null): string {
  const d = daysAgo(iso)
  return d == null ? '—' : `${d}d`
}

function money(value: string | number | null): string {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—'
}

function normalizeId(value: string | null | undefined): string {
  return (value ?? '').trim()
}

async function readActiveBucketRows(): Promise<DbRow[]> {
  return query<DbRow>(
    `SELECT mls_id, town, address_full, price, mls_status,
            modification_timestamp, status_change_timestamp, synced_at
       FROM listings
      WHERE status_bucket = 'Active'
      ORDER BY town, price DESC NULLS LAST`,
  )
}

async function reportFocusListing(mlsId: string): Promise<void> {
  const rows = await query<DbRow & { status_bucket: string }>(
    `SELECT mls_id, town, address_full, price, mls_status, status_bucket,
            modification_timestamp, status_change_timestamp, synced_at
       FROM listings
      WHERE mls_id = $1`,
    [mlsId],
  )
  console.log(`\n=== FOCUS ${mlsId} ===`)
  if (rows.length === 0) {
    console.log('postgres: no row')
  }
  for (const row of rows) {
    console.log(
      `postgres: bucket=${row.status_bucket} mls_status=${row.mls_status ?? '—'} town=${row.town} ${money(row.price)} ${row.address_full ?? '—'}`,
    )
    console.log(
      `postgres: modification=${row.modification_timestamp ?? '—'} (${age(row.modification_timestamp)}) statusChange=${row.status_change_timestamp ?? '—'} (${age(row.status_change_timestamp)}) syncedAt=${row.synced_at ?? '—'} (${age(row.synced_at)})`,
    )
  }
  try {
    const live = await getListingByMlsId(mlsId)
    if (!live) {
      console.log('mls: no record returned for this MLS number')
      return
    }
    console.log(
      `mls: status=${live.status} modification=${live.modificationTimestamp ?? '—'} (${age(live.modificationTimestamp)}) statusChange=${live.statusChangeTimestamp ?? '—'} (${age(live.statusChangeTimestamp)}) price=${money(live.price)}`,
    )
  } catch (err) {
    console.log(`mls: lookup failed — ${err instanceof Error ? err.message : String(err)}`)
  }
}

type TownAudit = {
  town: TmreTown
  dbCount: number
  mlsCount: number
  stale: DbRow[]
  errors: string[]
}

async function auditTown(town: TmreTown, dbRows: DbRow[]): Promise<TownAudit> {
  const errors: string[] = []
  const liveIds = new Set<string>()

  // Sequential: each search already fans out across the town's zips, so parallel
  // statuses would multiply concurrent SmartMLS logins.
  for (const status of ACTIVE_FAMILY) {
    try {
      const listings = await searchMarketListingsForTown(town, status, FETCH_LIMIT)
      for (const listing of listings) {
        const id = normalizeId(listing.mlsId)
        if (id) liveIds.add(id)
      }
    } catch (err) {
      errors.push(`${status}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const stale =
    errors.length > 0
      ? [] // a partial MLS set would report phantom staleness
      : dbRows.filter((row) => !liveIds.has(normalizeId(row.mls_id)))

  return { town, dbCount: dbRows.length, mlsCount: liveIds.size, stale, errors }
}

/** Bulk MLS pulls per town to name the true status of stale rows. */
async function classifyStale(
  town: TmreTown,
  staleIds: Set<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  if (staleIds.size === 0) return found
  for (const status of OFF_MARKET_BULK) {
    let listings: Listing[] = []
    try {
      listings = await searchListings({ city: town, status, limit: FETCH_LIMIT })
    } catch {
      continue
    }
    for (const listing of listings) {
      const id = normalizeId(listing.mlsId)
      if (id && staleIds.has(id) && !found.has(id)) {
        found.set(id, listing.status || status)
      }
    }
  }
  return found
}

async function main() {
  const focusIds = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))

  for (const id of focusIds) {
    await reportFocusListing(id)
  }

  const allRows = await readActiveBucketRows()
  console.log(`\n=== POSTGRES ACTIVE BUCKET ===`)
  console.log(`rows: ${allRows.length}`)

  const byStoredStatus = new Map<string, number>()
  for (const row of allRows) {
    const key = (row.mls_status ?? '(null)').trim() || '(blank)'
    byStoredStatus.set(key, (byStoredStatus.get(key) ?? 0) + 1)
  }
  console.log('stored mls_status inside the Active bucket:')
  for (const [status, count] of [...byStoredStatus].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(34)} ${count}`)
  }

  const rowsByTown = new Map<string, DbRow[]>()
  for (const row of allRows) {
    const list = rowsByTown.get(row.town) ?? []
    list.push(row)
    rowsByTown.set(row.town, list)
  }

  const audits: TownAudit[] = []
  for (const town of TMRE_TOWNS) {
    const rows = rowsByTown.get(town) ?? []
    process.stdout.write(`\nauditing ${town} (${rows.length} db rows)… `)
    const audit = await auditTown(town, rows)
    console.log(
      `mls=${audit.mlsCount} stale=${audit.stale.length}${audit.errors.length ? ` ERRORS: ${audit.errors.join('; ')}` : ''}`,
    )
    audits.push(audit)
  }

  const classified = new Map<string, string>()
  for (const audit of audits) {
    const ids = new Set(audit.stale.map((row) => normalizeId(row.mls_id)))
    const found = await classifyStale(audit.town, ids)
    for (const [id, status] of found) classified.set(id, status)
  }

  const unclassified = audits
    .flatMap((audit) => audit.stale)
    .filter((row) => !classified.has(normalizeId(row.mls_id)))
  console.log(
    `\nper-MLS lookups for ${Math.min(unclassified.length, UNKNOWN_LOOKUP_CAP)} of ${unclassified.length} unclassified…`,
  )
  for (const row of unclassified.slice(0, UNKNOWN_LOOKUP_CAP)) {
    const id = normalizeId(row.mls_id)
    try {
      const live = await getListingByMlsId(id)
      classified.set(id, live ? live.status || '(blank)' : '(not in MLS)')
    } catch (err) {
      classified.set(id, `(lookup failed: ${err instanceof Error ? err.message : String(err)})`)
    }
  }

  console.log(`\n=== STALE ACTIVES (in our Active bucket, not in MLS Active family) ===`)
  const totals = new Map<string, number>()
  for (const audit of audits) {
    if (audit.stale.length === 0) continue
    console.log(`\n${audit.town} — ${audit.stale.length} of ${audit.dbCount}`)
    for (const row of audit.stale) {
      const id = normalizeId(row.mls_id)
      const truth = classified.get(id) ?? '(unknown)'
      totals.set(truth, (totals.get(truth) ?? 0) + 1)
      console.log(
        `  ${id.padEnd(10)} ours=${(row.mls_status ?? '—').padEnd(12)} mls=${truth.padEnd(16)} ${money(row.price).padEnd(12)} mod=${age(row.modification_timestamp)} statusChg=${age(row.status_change_timestamp)} synced=${age(row.synced_at)}  ${row.address_full ?? '—'}`,
      )
    }
  }

  const staleTotal = audits.reduce((sum, audit) => sum + audit.stale.length, 0)
  const dbTotal = audits.reduce((sum, audit) => sum + audit.dbCount, 0)
  console.log(`\n=== TOTALS ===`)
  console.log(`db Active-bucket rows across TMRE towns: ${dbTotal}`)
  console.log(
    `stale (not in MLS Active family): ${staleTotal}${dbTotal ? ` (${((staleTotal / dbTotal) * 100).toFixed(1)}%)` : ''}`,
  )
  for (const [status, count] of [...totals].sort((a, b) => b[1] - a[1])) {
    console.log(`  now ${status.padEnd(24)} ${count}`)
  }
  const errored = audits.filter((audit) => audit.errors.length > 0)
  if (errored.length > 0) {
    console.log(
      `towns skipped for RETS errors (stale not computed): ${errored.map((a) => a.town).join(', ')}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
