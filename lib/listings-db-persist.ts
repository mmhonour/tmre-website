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

async function restorePersistedDbFile(
  dbPath: string,
  blobKey: string,
  minBytes: number,
): Promise<boolean> {
  if (!shouldUseBlobPersist()) return false

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
    console.info(`[listings-db] restored ${blobKey} from Netlify Blobs:`, data.byteLength, 'bytes')
    return true
  } catch (err) {
    console.warn(`[listings-db] Netlify Blobs restore skipped (${blobKey}):`, err)
    return false
  }
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
 * True when the write DB's listing count implies a failed/partial hydration
 * (e.g. this Lambda's blob restore silently failed and it seeded a schema-only
 * DB before an incremental sync added a small recent-changes batch). Comparing
 * against the last known-good count catches this even though the local DB is
 * internally consistent — it's just missing almost everything.
 */
async function looksLikeDegradedWriteDb(currentCount: number): Promise<{
  degraded: boolean
  lastGood: number
}> {
  const { getSyncMeta } = await import('@/lib/listings-db')
  const lastGoodRaw = getSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY)
  const lastGood = lastGoodRaw ? Number(lastGoodRaw) : 0
  if (!Number.isFinite(lastGood) || lastGood <= 0) {
    return { degraded: false, lastGood: 0 }
  }
  // Allow normal churn (closings/expirations move buckets); only block a drastic,
  // likely-corrupted drop.
  return { degraded: currentCount < Math.max(50, lastGood * 0.5), lastGood }
}

/** Checkpoint WAL and persist write + read snapshot + photos DB on serverless. */
export async function persistListingsDbCheckpoint(): Promise<boolean> {
  const { listingsDbPath, listingsReadDbPath, tryGetWriteDb, countWriteDbListings, setSyncMeta } =
    await import('@/lib/listings-db')
  const { listingPhotosDbPath, tryGetListingPhotosDb } = await import('@/lib/listing-photos-db')

  const active = shouldUseBlobPersist()
  const currentCount = countWriteDbListings()
  const { degraded, lastGood } = await looksLikeDegradedWriteDb(currentCount)
  if (degraded) {
    console.warn(
      `[listings-db] refused blob checkpoint — write DB has only ${currentCount} listings, far below last known good ${lastGood}. This Lambda likely failed to hydrate from blobs; leaving the existing good snapshot in place instead of overwriting it.`,
    )
    if (active) {
      setSyncMeta('blob_persist_last_at', new Date().toISOString())
      setSyncMeta('blob_persist_last_result', 'skipped_degraded')
    }
    return false
  }

  const writeOk = await persistListingsDbToBlob(listingsDbPath(), () => {
    tryGetWriteDb()?.pragma('wal_checkpoint(TRUNCATE)')
  })

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

  if (writeOk && currentCount > 0) {
    setSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY, String(currentCount))
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
  lastGoodListingCount: number | null
  lastPersistAt: string | null
  lastPersistResult: 'ok' | 'skipped_degraded' | null
  lastRestoreAt: string | null
}

/** Describe whether this request is using the Netlify Blobs round-trip or a plain local file. */
export async function describeBlobPersistRuntime(): Promise<BlobPersistRuntimeDiagnostics> {
  const { getSyncMeta } = await import('@/lib/listings-db')
  const active = shouldUseBlobPersist()
  const lastGoodRaw = getSyncMeta(LISTINGS_LAST_GOOD_COUNT_META_KEY)
  const lastGood = lastGoodRaw ? Number(lastGoodRaw) : null
  const lastPersistResult = getSyncMeta('blob_persist_last_result')

  return {
    active,
    mode: active ? 'netlify-blobs' : 'local-file',
    reason: active
      ? 'Netlify serverless — /tmp is ephemeral, so listings.db round-trips through Netlify Blobs on every cold start and checkpoint.'
      : 'Local/dev host — the SQLite file on disk is durable; no blob round-trip is used.',
    lastGoodListingCount: lastGood != null && Number.isFinite(lastGood) ? lastGood : null,
    lastPersistAt: getSyncMeta('blob_persist_last_at'),
    lastPersistResult: lastPersistResult === 'ok' || lastPersistResult === 'skipped_degraded' ? lastPersistResult : null,
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
    const readTooSmall =
      existsSync(readPath) &&
      existsSync(writePath) &&
      statSync(readPath).size < Math.min(statSync(writePath).size, MIN_BYTES)
    if (readMissing || readTooSmall) {
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
