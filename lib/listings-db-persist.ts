import 'server-only'

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { isServerlessRuntime } from '@/lib/runtime-host'

const BLOB_STORE = 'tmre-listings-db'
const BLOB_DB_KEY = 'listings-write.db'
const BLOB_READ_DB_KEY = 'listings-read.db'
const BLOB_PHOTOS_DB_KEY = 'listing-photos.db'
const BLOB_PROGRESS_KEY = 'chunked-full-resync-progress'
const MIN_BYTES = 50_000
const MIN_PHOTOS_BYTES = 4_096
/** sync_meta key tracking the last listing count we safely checkpointed to blobs. */
const LISTINGS_LAST_GOOD_COUNT_META_KEY = 'listings_last_good_count'

/**
 * Absolute floor for the write-DB listing count before we allow a blob checkpoint.
 * This is the single most important safety guard: without it, a Lambda that failed
 * to hydrate from blobs would restore a schema-only DB, run incremental sync (adding
 * only recent-changes, say 98 rows), then overwrite the good 948-row blob with that
 * degraded DB — and lock in 98 as the new "last good" count, making every future check
 * compare against 49 (50% of 98) instead of 800+.
 *
 * Set MIN_LISTING_COUNT env var in Netlify to override if your market grows/shrinks
 * significantly. Current TMRE production baseline is ~948.
 */
const ABSOLUTE_MIN_LISTING_COUNT = Math.max(
  1,
  Number(process.env.MIN_LISTING_COUNT ?? '2000'),
)

/** How many times to retry a blob fetch before giving up (with 1s/2s backoff). */
const BLOB_RESTORE_MAX_ATTEMPTS = 3

export type ChunkedFullResyncProgress = {
  fetchedTotal: number
  townsCompleted: string[]
  /** Finalize step IDs (see `FULL_RESYNC_FINALIZE_STEPS`) already completed this run. */
  finalizeStepsCompleted?: string[]
  updatedAt: string
}

function shouldUseBlobPersist(): boolean {
  return isServerlessRuntime() && process.env.NETLIFY === 'true'
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs')
  return getStore({ name: BLOB_STORE, consistency: 'strong' })
}

function removeWalSidecars(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    try {
      if (existsSync(sidecar)) unlinkSync(sidecar)
    } catch {
      /* ignore */
    }
  }
}

/** Restore the write DB from Netlify Blobs when blob is newer or larger than local /tmp. */
export async function restorePersistedListingsDb(dbPath: string): Promise<boolean> {
  return restorePersistedDbFile(dbPath, BLOB_DB_KEY, MIN_BYTES)
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function restorePersistedDbFile(
  dbPath: string,
  blobKey: string,
  minBytes: number,
): Promise<boolean> {
  if (!shouldUseBlobPersist()) return false

  let lastErr: unknown
  for (let attempt = 1; attempt <= BLOB_RESTORE_MAX_ATTEMPTS; attempt++) {
    try {
      const store = await getBlobStore()
      const result = await store.getWithMetadata(blobKey, { type: 'arrayBuffer' })
      const data = result?.data
      if (!data || data.byteLength < minBytes) return false

      const blobSavedAt = parseIsoMs(
        typeof result.metadata?.savedAt === 'string' ? result.metadata.savedAt : null,
      )
      const localExists = existsSync(dbPath)
      const localSize = localExists ? statSync(dbPath).size : 0
      const localMtime = localExists ? statSync(dbPath).mtimeMs : 0
      const blobIsLarger = data.byteLength > localSize
      const blobIsNewer = blobSavedAt != null && blobSavedAt > localMtime

      if (localExists && !blobIsLarger && !blobIsNewer) return false

      mkdirSync(path.dirname(dbPath), { recursive: true })
      writeFileSync(dbPath, Buffer.from(data))
      removeWalSidecars(dbPath)
      console.info(
        `[listings-db] restored ${blobKey} from Netlify Blobs:`,
        data.byteLength,
        'bytes',
        attempt > 1 ? `(attempt ${attempt})` : '',
      )
      return true
    } catch (err) {
      lastErr = err
      if (attempt < BLOB_RESTORE_MAX_ATTEMPTS) {
        console.warn(
          `[listings-db] Netlify Blobs restore attempt ${attempt}/${BLOB_RESTORE_MAX_ATTEMPTS} failed (${blobKey}), retrying in ${attempt}s…`,
          err,
        )
        await sleep(attempt * 1_000)
      }
    }
  }

  console.warn(
    `[listings-db] Netlify Blobs restore gave up after ${BLOB_RESTORE_MAX_ATTEMPTS} attempts (${blobKey}):`,
    lastErr,
  )
  return false
}

async function persistDbFileToBlob(
  dbPath: string,
  blobKey: string,
  minBytes: number,
  checkpoint?: () => void,
): Promise<boolean> {
  if (!shouldUseBlobPersist()) return false

  try {
    checkpoint?.()
    if (!existsSync(dbPath) || statSync(dbPath).size < minBytes) return false

    const bytes = readFileSync(dbPath)
    const store = await getBlobStore()
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    await store.set(blobKey, payload, {
      metadata: {
        bytes: String(bytes.length),
        savedAt: new Date().toISOString(),
      },
    })
    console.info(`[listings-db] persisted ${blobKey} to Netlify Blobs:`, bytes.length, 'bytes')
    return true
  } catch (err) {
    console.warn(`[listings-db] Netlify Blobs persist failed (${blobKey}):`, err)
    return false
  }
}

/** Checkpoint WAL and upload the write DB so the next Lambda can continue a chunked sync. */
export async function persistListingsDbToBlob(
  dbPath: string,
  checkpoint?: () => void,
): Promise<boolean> {
  return persistDbFileToBlob(dbPath, BLOB_DB_KEY, MIN_BYTES, checkpoint)
}

export async function persistListingsReadDbToBlob(
  readPath: string,
): Promise<boolean> {
  return persistDbFileToBlob(readPath, BLOB_READ_DB_KEY, MIN_BYTES)
}

export async function persistListingPhotosDbToBlob(
  photosPath: string,
  checkpoint?: () => void,
): Promise<boolean> {
  return persistDbFileToBlob(photosPath, BLOB_PHOTOS_DB_KEY, MIN_PHOTOS_BYTES, checkpoint)
}

/**
 * Return whether the write DB listing count looks like a failed/partial hydration,
 * and the threshold used to decide.
 *
 * Two independent checks apply:
 *  1. **Absolute floor** (`ABSOLUTE_MIN_LISTING_COUNT`, default 800): always enforced
 *     regardless of prior checkpoints. This prevents a brand-new or blob-restore-failed
 *     Lambda from bootstrapping a low "lastGood" baseline from which future checks
 *     would never catch degradation (e.g. lastGood=98 → threshold=49 → almost anything passes).
 *  2. **Relative floor** (75% of lastGood): catches a genuine data-loss event even if
 *     the absolute minimum has already been raised by prior good checkpoints.
 */
async function looksLikeDegradedWriteDb(currentCount: number): Promise<{
  degraded: boolean
  lastGood: number
  threshold: number
}> {
  const { getSyncMeta } = await import('@/lib/listings-db')
  const lastGoodRaw = getSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY)
  const lastGood = lastGoodRaw ? Number(lastGoodRaw) : 0
  const validLastGood = Number.isFinite(lastGood) && lastGood > 0 ? lastGood : 0
  // Use 75% of last good (tighter than the old 50%) so normal listing churn still passes
  // but a mid-resync partial state does not.
  const relativeFloor = validLastGood > 0 ? Math.round(validLastGood * 0.75) : 0
  const threshold = Math.max(ABSOLUTE_MIN_LISTING_COUNT, relativeFloor)
  return { degraded: currentCount < threshold, lastGood: validLastGood, threshold }
}

/** Public version of the degraded-DB check, used by syncIncrementalListings to abort early. */
export async function checkWriteDbDegraded(): Promise<{
  isDegraded: boolean
  currentCount: number
  lastGood: number
  threshold: number
}> {
  const { countWriteDbListings } = await import('@/lib/listings-db')
  const currentCount = countWriteDbListings()
  const { degraded, lastGood, threshold } = await looksLikeDegradedWriteDb(currentCount)
  return { isDegraded: degraded, currentCount, lastGood, threshold }
}

/** Checkpoint WAL and persist write + read snapshot + photos DB on serverless. */
export async function persistListingsDbCheckpoint(): Promise<boolean> {
  const { listingsDbPath, listingsReadDbPath, tryGetWriteDb, countWriteDbListings, setSyncMeta } =
    await import('@/lib/listings-db')
  const { listingPhotosDbPath, tryGetListingPhotosDb } = await import('@/lib/listing-photos-db')

  const active = shouldUseBlobPersist()
  const currentCount = countWriteDbListings()
  const { degraded, lastGood, threshold } = await looksLikeDegradedWriteDb(currentCount)
  if (degraded) {
    console.warn(
      `[listings-db] refused blob checkpoint — write DB has only ${currentCount} listings` +
        ` (threshold: ${threshold}, last good: ${lastGood || 'none'}).` +
        ` Lambda likely failed to hydrate; leaving the existing good snapshot untouched.`,
    )
    if (active) {
      setSyncMeta('blob_persist_last_at', new Date().toISOString())
      setSyncMeta('blob_persist_last_result', 'skipped_degraded')
      setSyncMeta('blob_persist_last_degraded_count', String(currentCount))
      setSyncMeta('blob_persist_last_threshold', String(threshold))
    }
    return false
  }

  // Write lastGood into sync_meta BEFORE the blob so it is included in the
  // wal_checkpoint(TRUNCATE) that persistListingsDbToBlob runs internally.
  // Without this, setSyncMeta writes to the WAL *after* the checkpoint has
  // already flushed and the DB file has been uploaded — the WAL entry is
  // stripped on restore, so the next Lambda sees lastGood = 0 (or stale),
  // lowering the threshold to 800 and allowing a 2.5K partial DB to overwrite
  // the good 26K blob.
  if (active && currentCount > 0) {
    setSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY, String(currentCount))
  }

  const writeOk = await persistListingsDbToBlob(listingsDbPath(), () => {
    tryGetWriteDb()?.pragma('wal_checkpoint(TRUNCATE)')
  })

  // If the blob write failed, revert lastGood so a stale/inflated value does
  // not let a future degraded DB slip past the checkpoint guard.
  if (active && !writeOk) {
    if (lastGood > 0) {
      setSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY, String(lastGood))
    }
  }
  // In non-blob environments (local dev) the write is a no-op, so set it now.
  if (!active && currentCount > 0) {
    setSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY, String(currentCount))
  }

  const readPath = listingsReadDbPath()
  let readOk = false
  if (existsSync(readPath)) {
    readOk = await persistListingsReadDbToBlob(readPath)
  }

  const photosPath = listingPhotosDbPath()
  let photosOk = false
  if (existsSync(photosPath)) {
    photosOk = await persistListingPhotosDbToBlob(photosPath, () => {
      tryGetListingPhotosDb()?.pragma('wal_checkpoint(TRUNCATE)')
    })
  }

  if (active && (writeOk || readOk || photosOk)) {
    setSyncMeta('blob_persist_last_at', new Date().toISOString())
    setSyncMeta('blob_persist_last_result', 'ok')
  }

  return writeOk || readOk || photosOk
}

export type BlobPersistRuntimeDiagnostics = {
  /** True on Netlify — /tmp is ephemeral and listings.db round-trips through blobs. */
  active: boolean
  mode: 'netlify-blobs' | 'local-file'
  reason: string
  /** Hardcoded absolute minimum; checkpoint is refused if the write DB has fewer listings. */
  absoluteMinListingCount: number
  lastGoodListingCount: number | null
  lastPersistAt: string | null
  lastPersistResult: 'ok' | 'skipped_degraded' | null
  /** Listing count at the time a skipped_degraded checkpoint was refused. */
  lastDegradedCount: number | null
  /** Threshold that triggered the last skipped_degraded refusal. */
  lastDegradedThreshold: number | null
  lastRestoreAt: string | null
}

/** Describe whether this request is using the Netlify Blobs round-trip or a plain local file. */
export async function describeBlobPersistRuntime(): Promise<BlobPersistRuntimeDiagnostics> {
  const { getSyncMeta } = await import('@/lib/listings-db')
  const active = shouldUseBlobPersist()
  const lastGoodRaw = getSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY)
  const lastGood = lastGoodRaw ? Number(lastGoodRaw) : null
  const lastPersistResult = getSyncMeta('blob_persist_last_result')
  const lastDegradedCountRaw = getSyncMeta('blob_persist_last_degraded_count')
  const lastDegradedThresholdRaw = getSyncMeta('blob_persist_last_threshold')

  return {
    active,
    mode: active ? 'netlify-blobs' : 'local-file',
    reason: active
      ? 'Netlify serverless — /tmp is ephemeral, so listings.db round-trips through Netlify Blobs on every cold start and checkpoint.'
      : 'Local/dev host — the SQLite file on disk is durable; no blob round-trip is used.',
    absoluteMinListingCount: ABSOLUTE_MIN_LISTING_COUNT,
    lastGoodListingCount: lastGood != null && Number.isFinite(lastGood) ? lastGood : null,
    lastPersistAt: getSyncMeta('blob_persist_last_at'),
    lastPersistResult: lastPersistResult === 'ok' || lastPersistResult === 'skipped_degraded' ? lastPersistResult : null,
    lastDegradedCount: lastDegradedCountRaw ? Number(lastDegradedCountRaw) : null,
    lastDegradedThreshold: lastDegradedThresholdRaw ? Number(lastDegradedThresholdRaw) : null,
    lastRestoreAt: getSyncMeta('blob_restore_last_at'),
  }
}

export async function readChunkedFullResyncProgress(): Promise<ChunkedFullResyncProgress | null> {
  if (!shouldUseBlobPersist()) return null

  try {
    const store = await getBlobStore()
    const raw = await store.get(BLOB_PROGRESS_KEY, { type: 'text' })
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChunkedFullResyncProgress
    if (typeof parsed.fetchedTotal !== 'number' || !Array.isArray(parsed.townsCompleted)) {
      return null
    }
    if (!Array.isArray(parsed.finalizeStepsCompleted)) {
      parsed.finalizeStepsCompleted = []
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveChunkedFullResyncProgress(
  progress: ChunkedFullResyncProgress,
): Promise<void> {
  if (!shouldUseBlobPersist()) return

  try {
    const store = await getBlobStore()
    await store.set(BLOB_PROGRESS_KEY, JSON.stringify(progress), {
      metadata: { updatedAt: progress.updatedAt },
    })
  } catch (err) {
    console.warn('[listings-db] chunked sync progress save failed:', err)
  }
}

export async function clearChunkedFullResyncProgress(): Promise<void> {
  if (!shouldUseBlobPersist()) return

  try {
    const store = await getBlobStore()
    await store.delete(BLOB_PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

async function recordBlobRestore(restored: boolean): Promise<void> {
  if (!restored || !shouldUseBlobPersist()) return
  const { setSyncMeta } = await import('@/lib/listings-db')
  setSyncMeta('blob_restore_last_at', new Date().toISOString())
}

/** Restore blob DB (if any) before opening SQLite — returns true when local file was replaced. */
export async function ensureListingsDbHydrated(resetConnections: () => void): Promise<boolean> {
  const { listingsDbPath } = await import('@/lib/listings-db')
  const restored = await restorePersistedListingsDb(listingsDbPath())
  if (restored) resetConnections()
  await recordBlobRestore(restored)
  return restored
}

/** Hydrate write, read snapshot, and listing-photos DBs for admin / read APIs on serverless. */
export async function ensureAdminSqliteDatabasesReady(
  resetConnections: () => void,
): Promise<boolean> {
  const { listingsDbPath, listingsReadDbPath, publishListingsReadSnapshot, tryGetWriteDb, countWriteDbListings } =
    await import('@/lib/listings-db')
  const { listingPhotosDbPath, resetListingPhotosDbConnection } = await import(
    '@/lib/listing-photos-db'
  )

  let restored = false
  if (await restorePersistedListingsDb(listingsDbPath())) restored = true
  if (await restorePersistedDbFile(listingsReadDbPath(), BLOB_READ_DB_KEY, MIN_BYTES)) {
    restored = true
  }
  if (await restorePersistedDbFile(listingPhotosDbPath(), BLOB_PHOTOS_DB_KEY, MIN_PHOTOS_BYTES)) {
    restored = true
  }

  if (restored) {
    resetConnections()
    resetListingPhotosDbConnection()
  }
  await recordBlobRestore(restored)

  const writeDb = tryGetWriteDb()
  if (writeDb && countWriteDbListings() > 0) {
    const readPath = listingsReadDbPath()
    const writePath = listingsDbPath()
    const readMissing = !existsSync(readPath)
    const readSize = readMissing ? 0 : statSync(readPath).size
    const writeSize = existsSync(writePath) ? statSync(writePath).size : 0
    // Republish if the read DB is absolutely tiny (< MIN_BYTES) OR if it is
    // disproportionately small relative to the write DB (< 25%). The second
    // check catches the schema-only seed case: e.g. a 144 KB read DB against
    // a 300 MB write DB would previously pass the old Math.min threshold.
    const readTooSmall =
      !readMissing &&
      writeSize > 0 &&
      (readSize < MIN_BYTES || readSize < writeSize * 0.25)
    if (readMissing || readTooSmall) {
      console.info(
        `[listings-db] republishing read snapshot — read DB size: ${readSize}, write DB size: ${writeSize}`,
      )
      publishListingsReadSnapshot()
      void persistListingsReadDbToBlob(readPath).catch(() => {})
    }
  }

  return restored
}

/** Restore blob DB before chunked admin sync. */
export async function prepareListingsDbForChunkedSync(
  _dbPath: string,
  resetConnections: () => void,
): Promise<void> {
  await ensureAdminSqliteDatabasesReady(resetConnections)
}

export function scheduleListingsDbBlobPersist(reason: string): void {
  if (!shouldUseBlobPersist()) return
  void persistListingsDbCheckpoint().catch((err) => {
    console.warn(`[listings-db] blob persist (${reason}) failed:`, err)
  })
}

/** Dedicated blob key for the refresh lock history — stored independently of the
 *  listings DB blob so it survives DB blob corruption or failed restores. */
const BLOB_REFRESH_HISTORY_KEY = 'refresh-lock-history'

/** Write the refresh lock history to its own blob key (fire-and-forget). */
export async function persistRefreshLockHistoryToBlob(
  entries: object[],
): Promise<void> {
  if (!shouldUseBlobPersist()) return
  try {
    const store = await getBlobStore()
    await store.setJSON(BLOB_REFRESH_HISTORY_KEY, entries)
  } catch (err) {
    console.warn('[listings-db] failed to persist refresh lock history to blob:', err)
  }
}

/** Read the refresh lock history from its own blob key. Returns null when blobs
 *  are not active or the key does not exist. */
export async function readRefreshLockHistoryFromBlob(): Promise<object[] | null> {
  if (!shouldUseBlobPersist()) return null
  try {
    const store = await getBlobStore()
    const result = await store.get(BLOB_REFRESH_HISTORY_KEY, { type: 'json' })
    if (!Array.isArray(result)) return null
    return result as object[]
  } catch {
    return null
  }
}
