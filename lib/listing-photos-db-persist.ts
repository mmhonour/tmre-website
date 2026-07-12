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
import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { listingPhotosDbPath, resetListingPhotosDbConnection, tryGetListingPhotosDb } from '@/lib/listing-photos-db'
import { isServerlessRuntime } from '@/lib/runtime-host'

const BLOB_STORE = 'tmre-listings-db'
const BLOB_PHOTOS_DB_KEY = 'listing-photos.db'
const MIN_PHOTOS_BYTES = 4_096
const BLOB_RESTORE_MAX_ATTEMPTS = 3
const BLOB_REFRESH_HISTORY_KEY = 'refresh-lock-history'

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
        `[listing-photos-db] restored ${blobKey} from Netlify Blobs:`,
        data.byteLength,
        'bytes',
        attempt > 1 ? `(attempt ${attempt})` : '',
      )
      return true
    } catch (err) {
      lastErr = err
      if (attempt < BLOB_RESTORE_MAX_ATTEMPTS) {
        console.warn(
          `[listing-photos-db] blob restore attempt ${attempt}/${BLOB_RESTORE_MAX_ATTEMPTS} failed (${blobKey}), retrying in ${attempt}s…`,
          err,
        )
        await sleep(attempt * 1_000)
      }
    }
  }

  console.warn(
    `[listing-photos-db] blob restore gave up after ${BLOB_RESTORE_MAX_ATTEMPTS} attempts (${blobKey}):`,
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
    console.info(`[listing-photos-db] persisted ${blobKey} to Netlify Blobs:`, bytes.length, 'bytes')
    return true
  } catch (err) {
    console.warn(`[listing-photos-db] blob persist failed (${blobKey}):`, err)
    return false
  }
}

export async function persistListingPhotosDbToBlob(
  photosPath: string,
  checkpoint?: () => void,
): Promise<boolean> {
  return persistDbFileToBlob(photosPath, BLOB_PHOTOS_DB_KEY, MIN_PHOTOS_BYTES, checkpoint)
}

/** Checkpoint WAL and persist listing-photos.db on serverless. */
export async function persistListingPhotosDbCheckpoint(): Promise<boolean> {
  const photosPath = listingPhotosDbPath()
  const photosOk = await persistListingPhotosDbToBlob(photosPath, () => {
    tryGetListingPhotosDb()?.pragma('wal_checkpoint(TRUNCATE)')
  })

  if (shouldUseBlobPersist() && photosOk) {
    setSyncMeta('photos_blob_persist_last_at', new Date().toISOString())
    setSyncMeta('photos_blob_persist_last_result', 'ok')
  }

  return photosOk
}

export function scheduleListingPhotosDbBlobPersist(reason: string): void {
  if (!shouldUseBlobPersist()) return
  void persistListingPhotosDbCheckpoint().catch((err) => {
    console.warn(`[listing-photos-db] blob persist (${reason}) failed:`, err)
  })
}

async function recordBlobRestore(restored: boolean): Promise<void> {
  if (!restored || !shouldUseBlobPersist()) return
  setSyncMeta('photos_blob_restore_last_at', new Date().toISOString())
}

/** Restore listing-photos.db from blobs before admin / photo APIs on serverless. */
export async function ensureAdminListingPhotosReady(): Promise<boolean> {
  const restored = await restorePersistedDbFile(
    listingPhotosDbPath(),
    BLOB_PHOTOS_DB_KEY,
    MIN_PHOTOS_BYTES,
  )
  if (restored) resetListingPhotosDbConnection()
  await recordBlobRestore(restored)
  return restored
}

export type PhotosBlobPersistRuntimeDiagnostics = {
  active: boolean
  mode: 'netlify-blobs' | 'local-file'
  reason: string
  lastPersistAt: string | null
  lastPersistResult: 'ok' | null
  lastRestoreAt: string | null
}

export async function describePhotosBlobPersistRuntime(): Promise<PhotosBlobPersistRuntimeDiagnostics> {
  const active = shouldUseBlobPersist()
  const lastPersistResult = getSyncMeta('photos_blob_persist_last_result')

  return {
    active,
    mode: active ? 'netlify-blobs' : 'local-file',
    reason: active
      ? 'Netlify serverless — /tmp is ephemeral, so listing-photos.db round-trips through Netlify Blobs on cold start and checkpoint.'
      : 'Local/dev host — the SQLite photo file on disk is durable; no blob round-trip is used.',
    lastPersistAt: getSyncMeta('photos_blob_persist_last_at'),
    lastPersistResult: lastPersistResult === 'ok' ? 'ok' : null,
    lastRestoreAt: getSyncMeta('photos_blob_restore_last_at'),
  }
}

export async function persistRefreshLockHistoryToBlob(entries: object[]): Promise<void> {
  if (!shouldUseBlobPersist()) return
  try {
    const store = await getBlobStore()
    await store.setJSON(BLOB_REFRESH_HISTORY_KEY, entries)
  } catch (err) {
    console.warn('[listing-photos-db] failed to persist refresh lock history to blob:', err)
  }
}

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
