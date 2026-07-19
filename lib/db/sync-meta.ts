import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'

// ---------------------------------------------------------------------------
// sync_meta accessors — the REFERENCE PATTERN for the Phase 4 consumer rewrite.
//
// Compare with the synchronous better-sqlite3 versions in lib/listings-db.ts
// (getSyncMeta / setSyncMeta / deleteSyncMeta). The shape of the change is:
//   * functions become `async` and return Promises
//   * `?` placeholders become `$1, $2, …`
//   * `INSERT ... ON CONFLICT(key) DO UPDATE SET value = excluded.value`
//     becomes `... EXCLUDED.value` (Postgres uppercases the pseudo-table)
//   * callers must `await` (this is the ripple that makes Phase 4 the big phase)
// ---------------------------------------------------------------------------

export async function getSyncMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = $1',
    [key],
  )
  return row?.value ?? null
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO sync_meta (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  )
}

export async function deleteSyncMeta(key: string): Promise<void> {
  await execute('DELETE FROM sync_meta WHERE key = $1', [key])
}

export async function getAllSyncMeta(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM sync_meta',
  )
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/**
 * Cross-instance lock: value is an ISO start timestamp. Acquires when the key
 * is missing, or the existing stamp is older than `staleAfterMs` (dead holder).
 * Returns true only when this caller owns the lock (RETURNING row present).
 */
export async function tryAcquireTimedLock(
  key: string,
  token: string,
  staleAfterMs: number,
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - Math.max(0, staleAfterMs)).toISOString()
  const row = await queryOne<{ key: string }>(
    `INSERT INTO sync_meta AS t (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value
     WHERE t.value < $3 OR t.value !~ '^[0-9]{4}-'
     RETURNING key`,
    [key, token, staleBefore],
  )
  return row != null
}

/** Release only if we still hold `token` (do not clear a stolen/replaced lock). */
export async function releaseTimedLock(key: string, token: string): Promise<void> {
  await execute('DELETE FROM sync_meta WHERE key = $1 AND value = $2', [key, token])
}
