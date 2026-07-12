import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'

// ---------------------------------------------------------------------------
// stats_cache — Postgres port (Phase 4). Async replacement for the SQLite
// stats-cache accessors in lib/listings-db.ts. `payload` is a jsonb column, so
// pg parses it to an object on read; we stringify it back to the `payload:
// string` contract the SQLite version returned (all consumers JSON.parse it).
// `computed_at` (timestamptz) is returned as an ISO string, matching the SQLite
// storage format used for TTL/staleness checks.
//
// The SQLite `stats?: SqliteWriteStatsCollector` parameter is intentionally
// dropped: no stats_cache call site ever passed one (the tally came only from
// the ambient refresh-lock collector, which is SQLite-only machinery).
// ---------------------------------------------------------------------------

export type StatsCacheRow = { payload: string; computedAt: string }

/** jsonb (object from pg) or a serialized string → the string payload contract. */
function payloadToString(value: unknown): string {
  if (value == null) return 'null'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** timestamptz (Date from pg) → ISO string, matching SQLite storage. */
function tsToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return value == null ? '' : String(value)
}

export async function readStatsCacheRow(key: string): Promise<StatsCacheRow | null> {
  const row = await queryOne<{ payload: unknown; computed_at: Date | string | null }>(
    'SELECT payload, computed_at FROM stats_cache WHERE cache_key = $1',
    [key],
  )
  if (!row) return null
  return { payload: payloadToString(row.payload), computedAt: tsToIso(row.computed_at) }
}

export async function writeStatsCacheRow(key: string, payload: unknown): Promise<void> {
  await execute(
    `INSERT INTO stats_cache (cache_key, payload, computed_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (cache_key) DO UPDATE SET
       payload = EXCLUDED.payload,
       computed_at = EXCLUDED.computed_at`,
    [key, JSON.stringify(payload ?? null), new Date()],
  )
}

/**
 * Clear the rebuildable stats cache while preserving the "last-good" feed rows.
 * Mirrors lib/listings-db.ts clearStatsCache: deal-of-the-day / latest-town-feed
 * / latest-feed entries survive an hourly stats rebuild. Returns rows deleted.
 */
export async function clearStatsCache(): Promise<number> {
  return execute(
    `DELETE FROM stats_cache
      WHERE cache_key NOT LIKE 'deal-of-the-day:%'
        AND cache_key NOT LIKE 'latest-town-feed:%'
        AND cache_key NOT LIKE 'latest-feed:%'`,
  )
}

/** Delete every stats_cache row whose key starts with `prefix`. Returns count. */
export async function clearCacheByPrefix(prefix: string): Promise<number> {
  return execute('DELETE FROM stats_cache WHERE cache_key LIKE $1', [`${prefix}%`])
}

/** Bulk read helper — several rows by key in one round trip. */
export async function readStatsCacheRows(
  keys: readonly string[],
): Promise<Map<string, StatsCacheRow>> {
  const out = new Map<string, StatsCacheRow>()
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))]
  if (unique.length === 0) return out
  const rows = await query<{ cache_key: string; payload: unknown; computed_at: Date | string | null }>(
    'SELECT cache_key, payload, computed_at FROM stats_cache WHERE cache_key = ANY($1::text[])',
    [unique],
  )
  for (const row of rows) {
    out.set(row.cache_key, {
      payload: payloadToString(row.payload),
      computedAt: tsToIso(row.computed_at),
    })
  }
  return out
}
