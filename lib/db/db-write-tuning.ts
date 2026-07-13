import 'server-only'

import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'

/**
 * Admin-tunable database write tuning.
 *
 * Rows-per-statement for chunked upserts (see lib/db/chunked-upsert.ts). Kept in
 * `sync_meta` so it can be changed from the Admin page without a code change /
 * redeploy. The value is always clamped to a safe range; chunkedUpsert further
 * caps it to Postgres's bind-param limit per table.
 */

export const DB_UPSERT_CHUNK_ROWS_KEY = 'db_upsert_chunk_rows'
export const DB_UPSERT_CHUNK_ROWS_DEFAULT = 500
export const DB_UPSERT_CHUNK_ROWS_MIN = 25
export const DB_UPSERT_CHUNK_ROWS_MAX = 5000

export function clampChunkRows(value: number): number {
  if (!Number.isFinite(value)) return DB_UPSERT_CHUNK_ROWS_DEFAULT
  return Math.max(
    DB_UPSERT_CHUNK_ROWS_MIN,
    Math.min(DB_UPSERT_CHUNK_ROWS_MAX, Math.round(value)),
  )
}

/** Configured rows-per-INSERT for chunked upserts (synchronous, cached). */
export function getUpsertChunkRows(): number {
  const raw = getSyncMeta(DB_UPSERT_CHUNK_ROWS_KEY)
  if (raw == null) return DB_UPSERT_CHUNK_ROWS_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clampChunkRows(parsed) : DB_UPSERT_CHUNK_ROWS_DEFAULT
}

/** Persist a new chunk size (durable) and return the clamped value applied. */
export async function setUpsertChunkRows(value: number): Promise<number> {
  const clamped = clampChunkRows(value)
  await setSyncMetaDurable(DB_UPSERT_CHUNK_ROWS_KEY, String(clamped))
  return clamped
}
