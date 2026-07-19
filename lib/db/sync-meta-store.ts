import 'server-only'

import {
  deleteSyncMeta as deleteSyncMetaDb,
  getAllSyncMeta as getAllSyncMetaDb,
  releaseTimedLock as releaseTimedLockDb,
  setSyncMeta as setSyncMetaDb,
  tryAcquireTimedLock as tryAcquireTimedLockDb,
} from '@/lib/db/sync-meta'

// ---------------------------------------------------------------------------
// sync_meta — synchronous in-memory store backed by Postgres.
//
// The SQLite-era accessors (lib/listings-db.ts getSyncMeta/setSyncMeta/
// deleteSyncMeta) were synchronous because better-sqlite3 is synchronous.
// Postgres is network I/O, so a naive port would force `await` through the
// entire RETS layer (isRetsConfigured / requireEnv / assertRetsConfigured) and
// dozens of sync callers.
//
// Instead we hydrate every sync_meta row into an in-memory Map once at startup
// (awaited in instrumentation.register(), before the first request), then serve
// reads synchronously from the Map. Writes update the Map immediately and
// write through to Postgres:
//   * setSyncMeta / deleteSyncMeta  → sync facade, fire-and-forget durability
//   * setSyncMetaDurable / deleteSyncMetaDurable → awaitable (use on the sync
//     finalize / admin paths where the DB write must be confirmed before the
//     serverless invocation can freeze)
//
// Consistency model: the cache is per-process. A write on one instance is not
// visible to another instance's cache until that instance re-hydrates (cold
// start).
//
// ADMIN / SITE-CONTROL KEYS must NOT rely on this cache for truth. Contact
// email/phone, photo TTL, spotlight MLS/privacy overrides, and scheduled-sync
// pause all have *Fresh helpers that read Postgres (Neon in production) live
// so every Lambda sees the same row Admin just wrote. Keep this Map for
// operational timestamps (last_full_sync, etc.) that tolerate eventual
// consistency.
// ---------------------------------------------------------------------------

const cache = new Map<string, string>()
let hydrated = false

/** Load the full sync_meta table into the in-memory cache. Awaited at startup. */
export async function hydrateSyncMetaStore(): Promise<void> {
  const all = await getAllSyncMetaDb()
  cache.clear()
  for (const [key, value] of Object.entries(all)) {
    cache.set(key, value)
  }
  hydrated = true
}

/** True once hydrateSyncMetaStore() has completed at least once. */
export function isSyncMetaStoreHydrated(): boolean {
  return hydrated
}

function logWriteThroughError(op: string, key: string, err: unknown): void {
  console.error(`[sync-meta-store] ${op} write-through failed for "${key}"`, err)
}

export function getSyncMeta(key: string): string | null {
  return cache.has(key) ? (cache.get(key) as string) : null
}

export function getAllSyncMeta(): Record<string, string> {
  return Object.fromEntries(cache.entries())
}

/** Sync facade: updates the cache now, writes through to Postgres in the background. */
export function setSyncMeta(key: string, value: string): void {
  cache.set(key, value)
  void setSyncMetaDb(key, value).catch((err) => logWriteThroughError('set', key, err))
}

/** Sync facade: removes from cache now, deletes from Postgres in the background. */
export function deleteSyncMeta(key: string): void {
  cache.delete(key)
  void deleteSyncMetaDb(key).catch((err) => logWriteThroughError('delete', key, err))
}

/** Awaitable write — resolves only after the Postgres row is committed. */
export async function setSyncMetaDurable(key: string, value: string): Promise<void> {
  cache.set(key, value)
  await setSyncMetaDb(key, value)
}

/** Awaitable delete — resolves only after the Postgres row is removed. */
export async function deleteSyncMetaDurable(key: string): Promise<void> {
  cache.delete(key)
  await deleteSyncMetaDb(key)
}

/** Durable cross-instance lock (Postgres). Updates the local cache on success. */
export async function tryAcquireTimedLock(
  key: string,
  token: string,
  staleAfterMs: number,
): Promise<boolean> {
  const ok = await tryAcquireTimedLockDb(key, token, staleAfterMs)
  if (ok) cache.set(key, token)
  return ok
}

/** Durable unlock — only clears when `token` still matches. */
export async function releaseTimedLock(key: string, token: string): Promise<void> {
  await releaseTimedLockDb(key, token)
  if (cache.get(key) === token) cache.delete(key)
}
