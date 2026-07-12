import 'server-only'

import { isServerlessRuntime } from '@/lib/runtime-host'

const BLOB_STORE = 'tmre-listings-db'
const BLOB_PROGRESS_KEY = 'chunked-full-resync-progress'

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

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs')
  return getStore({ name: BLOB_STORE, consistency: 'strong' })
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
    console.warn('[chunked-resync-progress] save failed:', err)
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
