/** Default window for Admin Database sync history (1 year of durable logs). */
export const ADMIN_SYNC_HISTORY_DEFAULT_DAYS = 365

/**
 * Cap for a single history page. ~7 towns × 48 incremental ticks/day ≈ 336
 * town-rows/day; a year is ~120k. Pagination + glom keep the UI usable.
 */
export const ADMIN_SYNC_HISTORY_MAX_LIMIT = 20_000

/** Strip suffixes like "Active/incremental" → "Active". */
export function normalizeSyncStatusBucket(bucket: string | null | undefined): string {
  const raw = (bucket ?? 'Unknown').trim()
  if (!raw) return 'Unknown'
  return raw.split('/')[0]?.trim() || raw
}

/**
 * Lifecycle ack / roll-up buckets — Bucket alone does not say Full vs Incremental,
 * so History labels them as "Queued · Incremental".
 */
export function isSyncLifecycleBucket(bucket: string | null | undefined): boolean {
  const b = (bucket ?? '').trim()
  return b === 'Queued' || b === 'Worker' || b === 'Done' || b === 'Failed'
}

/** Pretty labels for status_bucket suffixes used by dashboard job audits. */
const SYNC_TYPE_LABELS: Record<string, string> = {
  incremental: 'Incremental',
  full: 'Full',
  goldilocks: 'Goldilocks',
  stats: 'Stats cache',
  'deal-day': 'Deal of the Day',
  addresses: 'Addresses',
  vision: 'Vision addresses',
  'zip-maps': 'Zip boundaries',
  'open-houses': 'Open houses',
  alerts: 'Listing / OH alerts',
  snapshot: 'Refresh finished',
  fomc: 'FOMC',
  cpi: 'CPI',
  digest: 'Market brief',
  'cama-tax': 'CAMA tax',
  'db-size': 'Size & growth',
  'hero-photos': 'R2 photo scavenger',
}

/** Display label for the Bucket column / subgroup (adds sync type on lifecycle rows). */
export function formatSyncHistoryBucketLabel(
  bucket: string,
  syncType: string,
): string {
  if (isSyncLifecycleBucket(bucket) && syncType.trim()) {
    return `${bucket} · ${syncType}`
  }
  return bucket
}

/**
 * Sync mode from status_bucket suffixes, e.g. "Active/incremental" → "Incremental".
 * Plain Active / Closed / Expired (full town/bucket pulls) → "Full".
 * Cron heartbeat rows use "cron/incremental" → "Cron".
 * Queue/worker audits use "Queued/incremental" / "Worker/incremental".
 * Job roll-up uses "Done/incremental" with total upserted across towns.
 */
export function normalizeSyncType(bucket: string | null | undefined): string {
  const raw = (bucket ?? '').trim()
  const suffix = raw.includes('/') ? raw.split('/').slice(1).join('/').trim() : ''
  if (!suffix) return 'Full'
  if (raw.toLowerCase().startsWith('cron/')) return 'Cron'
  const key = suffix.toLowerCase()
  if (SYNC_TYPE_LABELS[key]) return SYNC_TYPE_LABELS[key]!
  return suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase()
}

/** Synthetic all-town audit rows (queue ack, worker start) — keep OK detail text. */
function isSyntheticAuditTown(town: string | null | undefined): boolean {
  const t = (town ?? '').trim().toLowerCase()
  return t === '(all)' || t === '(cron)' || t === '(watchdog)'
}

/**
 * Intentional Configure / queue skips (not RETS failures). Older rows were
 * written with ok=false; treat the message as Skipped in History either way.
 * `scheduler is eventbridge` is a retired message kept so old rows still read
 * as Skipped rather than Failed.
 */
export function isSyncHistorySkipMessage(
  error: string | null | undefined,
): boolean {
  const e = (error ?? '').trim().toLowerCase()
  if (!e) return false
  return (
    e.includes('netlify cron ignored') ||
    e.includes('netlify watchdog ignored') ||
    e.includes('scheduler is eventbridge') ||
    e.includes('paused by admin') ||
    e.includes('not due yet') ||
    e.includes('deferred —') ||
    e.includes('prior queue still waiting') ||
    e.includes('netlify cron stood down') ||
    e.includes('cooling down after a killed run') ||
    e.includes('http 429') ||
    e.includes('rate limited') ||
    e === 'skipped' ||
    e.startsWith('skipped')
  )
}

/** Status chip for Sync History: OK | Skipped | Failed. */
export function syncHistoryStatusLabel(run: {
  ok: boolean
  error: string | null
}): 'OK' | 'Skipped' | 'Failed' {
  if (isSyncHistorySkipMessage(run.error)) return 'Skipped'
  return run.ok ? 'OK' : 'Failed'
}

/** "Westport (12), Norwalk (8)". */
export function formatTownCountsGlom(
  towns: readonly { town: string; count: number }[],
): string {
  if (towns.length === 0) return '—'
  return towns
    .map((row) => `${row.town} (${row.count.toLocaleString()})`)
    .join(', ')
}

export type SyncHistoryRawRow = {
  id: number
  startedAt: string
  finishedAt: string | null
  town: string | null
  statusBucket: string | null
  listingsCount: number
  ok: boolean
  error: string | null
}

/** One display row: a sync batch glommed by sync type × status bucket across towns. */
export type SyncHistoryGlomRow = {
  key: string
  startedAt: string
  finishedAt: string | null
  syncType: string
  bucket: string
  townsLabel: string
  listingsCount: number
  ok: boolean
  error: string | null
  durationMs: number | null
  townCount: number
}

/**
 * Same Incremental/Full pull: town RETS chunks start a few minutes apart.
 * Applied only among rows that already share sync type + bucket. A global
 * 20-minute chain stayed open forever because Vision / alerts / photos keep
 * firing, so Incremental Active+Closed from 4:00 PM Sat to 10:02 AM Mon
 * became one 2521-minute "OK" line.
 */
const SAME_PULL_GAP_MS = 10 * 60 * 1000

const BUCKET_ORDER = [
  'Queued',
  'Worker',
  'Active+Closed',
  'Active+Closed+Expired',
  'Active',
  'Closed',
  'Expired',
  'Done',
  'Failed',
  'cron',
]

function parseMs(iso: string | null | undefined): number {
  if (!iso) return NaN
  return Date.parse(iso)
}

/** One Admin Syncs job write — not a per-town RETS chunk. */
function isStandaloneJobAudit(run: SyncHistoryRawRow): boolean {
  return (
    isSyntheticAuditTown(run.town) &&
    isSyncLifecycleBucket(normalizeSyncStatusBucket(run.statusBucket))
  )
}

function glomTypeBucketRows(
  rows: SyncHistoryRawRow[],
  batchIndex: number,
): SyncHistoryGlomRow {
  const syncType = normalizeSyncType(rows[0]?.statusBucket)
  const bucket = normalizeSyncStatusBucket(rows[0]?.statusBucket)
  const startedMs = Math.min(
    ...rows.map((r) => parseMs(r.startedAt)).filter(Number.isFinite),
  )
  const finishedMsList = rows
    .map((r) => parseMs(r.finishedAt))
    .filter((n) => Number.isFinite(n))
  const finishedMs =
    finishedMsList.length > 0 ? Math.max(...finishedMsList) : NaN
  const towns = rows
    .filter((r) => r.town)
    .map((r) => ({ town: r.town!, count: r.listingsCount }))
    .reduce<{ town: string; count: number }[]>((acc, row) => {
      const existing = acc.find((t) => t.town === row.town)
      if (existing) {
        existing.count = Math.max(existing.count, row.count)
        return acc
      }
      acc.push({ ...row })
      return acc
    }, [])
    .sort((a, b) => a.town.localeCompare(b.town))

  const effectiveOk = rows.every(
    (r) => r.ok || isSyncHistorySkipMessage(r.error),
  )
  const failErrors = rows
    .filter((r) => !r.ok && !isSyncHistorySkipMessage(r.error) && r.error)
    .map((r) => `${r.town ?? '?'}: ${r.error}`)
  const noteDetails = rows
    .filter(
      (r) =>
        r.error &&
        isSyntheticAuditTown(r.town) &&
        (r.ok || isSyncHistorySkipMessage(r.error)),
    )
    .map((r) => r.error!.trim())
    .filter(Boolean)
  const listingsCount = towns.reduce((sum, t) => sum + t.count, 0)

  return {
    key: `batch-${batchIndex}-${syncType}-${bucket}-${rows[0]?.id ?? 0}`,
    startedAt: Number.isFinite(startedMs)
      ? new Date(startedMs).toISOString()
      : rows[0]!.startedAt,
    finishedAt: Number.isFinite(finishedMs)
      ? new Date(finishedMs).toISOString()
      : null,
    syncType,
    bucket,
    townsLabel: formatTownCountsGlom(towns),
    listingsCount,
    ok: effectiveOk,
    error:
      failErrors.length > 0
        ? failErrors.join('\n')
        : noteDetails.length > 0
          ? [...new Set(noteDetails)].join('\n')
          : null,
    durationMs:
      Number.isFinite(startedMs) &&
      Number.isFinite(finishedMs) &&
      finishedMs >= startedMs
        ? finishedMs - startedMs
        : null,
    townCount: towns.length,
  }
}

function bucketSortKey(a: string, b: string): number {
  const ia = BUCKET_ORDER.indexOf(a)
  const ib = BUCKET_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

function typeBucketKey(run: SyncHistoryRawRow): string {
  return `${normalizeSyncType(run.statusBucket)}\0${normalizeSyncStatusBucket(run.statusBucket)}`
}

function splitTownPulls(rows: SyncHistoryRawRow[]): SyncHistoryRawRow[][] {
  const chronological = [...rows].sort((a, b) => {
    const da = parseMs(a.startedAt)
    const db = parseMs(b.startedAt)
    if (da !== db) return da - db
    return a.id - b.id
  })
  const pulls: SyncHistoryRawRow[][] = []
  for (const run of chronological) {
    const last = pulls[pulls.length - 1]
    if (!last) {
      pulls.push([run])
      continue
    }
    const prev = last[last.length - 1]!
    const gap = parseMs(run.startedAt) - parseMs(prev.startedAt)
    if (Number.isFinite(gap) && gap >= 0 && gap <= SAME_PULL_GAP_MS) {
      last.push(run)
    } else {
      pulls.push([run])
    }
  }
  return pulls
}

/**
 * Collapse per-town sync_runs into one line per pull × type × bucket, e.g.
 * Incremental · Active+Closed · Westport (12), Norwalk (8).
 *
 * Dashboard job audits (Done/Failed/Queued on `(all)`) stay one line each.
 * Town rows only glom with the same type+bucket and only inside one pull.
 */
export function glomSyncHistoryRuns(runs: SyncHistoryRawRow[]): SyncHistoryGlomRow[] {
  if (runs.length === 0) return []

  const byTypeBucket = new Map<string, SyncHistoryRawRow[]>()
  for (const run of runs) {
    const key = typeBucketKey(run)
    const list = byTypeBucket.get(key) ?? []
    list.push(run)
    byTypeBucket.set(key, list)
  }

  const out: SyncHistoryGlomRow[] = []
  let bi = 0
  const keys = [...byTypeBucket.keys()].sort((ka, kb) => {
    const [typeA, bucketA] = ka.split('\0')
    const [typeB, bucketB] = kb.split('\0')
    if (typeA !== typeB) return typeA.localeCompare(typeB)
    return bucketSortKey(bucketA!, bucketB!)
  })

  for (const key of keys) {
    const rows = byTypeBucket.get(key)!
    if (rows.every(isStandaloneJobAudit)) {
      for (const run of rows) {
        out.push(glomTypeBucketRows([run], bi))
        bi += 1
      }
      continue
    }
    for (const pull of splitTownPulls(rows)) {
      out.push(glomTypeBucketRows(pull, bi))
      bi += 1
    }
  }

  return out.sort((a, b) => {
    const da = parseMs(a.startedAt)
    const db = parseMs(b.startedAt)
    if (da !== db) return db - da
    if (a.syncType !== b.syncType) return a.syncType.localeCompare(b.syncType)
    return bucketSortKey(a.bucket, b.bucket)
  })
}
