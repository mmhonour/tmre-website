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
