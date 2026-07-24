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
 * Sync mode from status_bucket suffixes, e.g. "Active/incremental" → "Incremental".
 * Plain Active / Closed / Expired (full town/bucket pulls) → "Full".
 * Cron heartbeat rows use "cron/incremental" → "Cron".
 */
export function normalizeSyncType(bucket: string | null | undefined): string {
  const raw = (bucket ?? '').trim()
  const suffix = raw.includes('/') ? raw.split('/').slice(1).join('/').trim() : ''
  if (!suffix) return 'Full'
  if (raw.toLowerCase().startsWith('cron/')) return 'Cron'
  return suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase()
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

/** Towns synced within this gap of each other count as one incremental/full batch. */
const BATCH_GAP_MS = 20 * 60 * 1000

const BUCKET_ORDER = ['Active', 'Closed', 'Expired', 'cron']

function parseMs(iso: string | null | undefined): number {
  if (!iso) return NaN
  return Date.parse(iso)
}

function bucketSortKey(a: string, b: string): number {
  const ia = BUCKET_ORDER.indexOf(a)
  const ib = BUCKET_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

/**
 * Collapse per-town sync_runs into one line per (batch × sync type × bucket), e.g.
 * Incremental · Active · Westport (12), Norwalk (8)
 */
export function glomSyncHistoryRuns(runs: SyncHistoryRawRow[]): SyncHistoryGlomRow[] {
  if (runs.length === 0) return []

  const chronological = [...runs].sort((a, b) => {
    const da = parseMs(a.startedAt)
    const db = parseMs(b.startedAt)
    if (da !== db) return da - db
    return a.id - b.id
  })

  const batches: SyncHistoryRawRow[][] = []
  for (const run of chronological) {
    const lastBatch = batches[batches.length - 1]
    if (!lastBatch) {
      batches.push([run])
      continue
    }
    const prev = lastBatch[lastBatch.length - 1]
    const gap = parseMs(run.startedAt) - parseMs(prev.startedAt)
    if (Number.isFinite(gap) && gap >= 0 && gap <= BATCH_GAP_MS) {
      lastBatch.push(run)
    } else {
      batches.push([run])
    }
  }

  const out: SyncHistoryGlomRow[] = []
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const byTypeBucket = new Map<string, SyncHistoryRawRow[]>()
    for (const run of batch) {
      const syncType = normalizeSyncType(run.statusBucket)
      const bucket = normalizeSyncStatusBucket(run.statusBucket)
      const key = `${syncType}\0${bucket}`
      const list = byTypeBucket.get(key) ?? []
      list.push(run)
      byTypeBucket.set(key, list)
    }
    const keys = [...byTypeBucket.keys()].sort((ka, kb) => {
      const [typeA, bucketA] = ka.split('\0')
      const [typeB, bucketB] = kb.split('\0')
      if (typeA !== typeB) return typeA.localeCompare(typeB)
      return bucketSortKey(bucketA!, bucketB!)
    })

    for (const key of keys) {
      const rows = byTypeBucket.get(key)!
      const syncType = normalizeSyncType(rows[0]?.statusBucket)
      const bucket = normalizeSyncStatusBucket(rows[0]?.statusBucket)
      const startedMs = Math.min(...rows.map((r) => parseMs(r.startedAt)).filter(Number.isFinite))
      const finishedMsList = rows
        .map((r) => parseMs(r.finishedAt))
        .filter((n) => Number.isFinite(n))
      const finishedMs =
        finishedMsList.length > 0 ? Math.max(...finishedMsList) : NaN
      const towns = rows
        .filter((r) => r.town)
        .map((r) => ({ town: r.town!, count: r.listingsCount }))
        // Prefer higher count if a town appears twice in the batch window
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

      const ok = rows.every((r) => r.ok)
      const errors = rows
        .filter((r) => !r.ok && r.error)
        .map((r) => `${r.town ?? '?'}: ${r.error}`)
      const listingsCount = towns.reduce((sum, t) => sum + t.count, 0)

      out.push({
        key: `batch-${bi}-${syncType}-${bucket}-${rows[0]?.id ?? 0}`,
        startedAt: Number.isFinite(startedMs)
          ? new Date(startedMs).toISOString()
          : rows[0].startedAt,
        finishedAt: Number.isFinite(finishedMs)
          ? new Date(finishedMs).toISOString()
          : null,
        syncType,
        bucket,
        townsLabel: formatTownCountsGlom(towns),
        listingsCount,
        ok,
        error: errors.length > 0 ? errors.join('\n') : null,
        durationMs:
          Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs
            ? finishedMs - startedMs
            : null,
        townCount: towns.length,
      })
    }
  }

  // Newest batch first; within a batch keep type then Active → Closed → Expired
  return out.reverse()
}
