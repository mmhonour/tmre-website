#!/usr/bin/env node
/**
 * Read-only stats-cache diagnosis against the live database.
 * Prints sync_meta clocks, stats_cache freshness, and recent Stats sync_runs.
 * Never prints connection strings or secrets.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/diagnose-stats-cache.ts
 */
import { existsSync } from 'node:fs'
import { query, queryOne } from '../lib/db/postgres'

// Keep the prod URL out of .env.local: export PROD_DATABASE_URL to aim at production.
const prodUrl = process.env.PROD_DATABASE_URL?.trim() || null
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}
if (prodUrl) {
  process.env.DATABASE_URL = prodUrl
  console.info('[diagnose-stats-cache] target: PRODUCTION')
} else {
  console.info('[diagnose-stats-cache] target: .env.local database')
}

const STATS_META_KEYS = [
  'last_stats_cache',
  'last_stats_cache_started',
  'stats_cache_rebuild_lock',
  'stats_cache_queue_backoff_until',
  'overdue_sync_catchup_in_progress',
  'overdue_sync_catchup_started_at',
  'overdue_sync_catchup_finished_at',
  'refresh_in_progress',
  'last_incremental_sync',
  'last_incremental_sync_started',
]

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return `${iso} (unparseable)`
  const mins = Math.round((Date.now() - ms) / 60_000)
  return `${iso}  (${mins} min ago)`
}

async function main() {
  console.info('=== sync_meta clocks ===')
  const meta = await query<{ key: string; value: string }>(
    'SELECT key, value FROM sync_meta WHERE key = ANY($1::text[]) ORDER BY key',
    [STATS_META_KEYS],
  )
  const byKey = new Map(meta.map((r) => [r.key, r.value]))
  for (const key of STATS_META_KEYS) {
    const val = byKey.get(key) ?? null
    const looksIso = val != null && /^\d{4}-\d{2}-\d{2}T/.test(val)
    console.info(`  ${key.padEnd(34)} ${looksIso ? ageLabel(val) : (val ?? '—')}`)
  }

  console.info('')
  console.info('=== stats_cache table ===')
  const cache = await queryOne<{
    rows: string
    newest: string | null
    oldest: string | null
  }>(
    `SELECT count(*)::text AS rows,
            max(computed_at)::text AS newest,
            min(computed_at)::text AS oldest
       FROM stats_cache`,
  )
  console.info(`  rows            ${cache?.rows ?? '0'}`)
  console.info(`  newest payload  ${ageLabel(cache?.newest ?? null)}`)
  console.info(`  oldest payload  ${ageLabel(cache?.oldest ?? null)}`)

  console.info('')
  console.info('=== recent Stats sync_runs (last 24h) ===')
  const runs = await query<{
    started_at: string
    finished_at: string | null
    status_bucket: string | null
    ok: boolean
    listings_count: number
    error: string | null
  }>(
    `SELECT started_at::text, finished_at::text, status_bucket, ok,
            listings_count, error
       FROM sync_runs
      WHERE status_bucket LIKE '%/stats'
        AND started_at > now() - interval '24 hours'
      ORDER BY started_at DESC
      LIMIT 25`,
  )
  if (runs.length === 0) {
    console.info('  (no Stats rows in the last 24h)')
  }
  for (const r of runs) {
    console.info(
      `  ${r.started_at} → ${r.finished_at ?? '—'} ${String(r.status_bucket).padEnd(14)} ok=${r.ok} n=${r.listings_count} ${r.error ?? ''}`,
    )
  }

  console.info('')
  console.info('=== most recent sync_runs of any type (last 2h) ===')
  const any = await query<{
    started_at: string
    status_bucket: string | null
    ok: boolean
    error: string | null
  }>(
    `SELECT started_at::text, status_bucket, ok, error
       FROM sync_runs
      WHERE started_at > now() - interval '2 hours'
      ORDER BY started_at DESC
      LIMIT 25`,
  )
  if (any.length === 0) {
    console.info('  (nothing in 2h — no scheduled function is writing at all)')
  }
  for (const r of any) {
    console.info(
      `  ${r.started_at} ${String(r.status_bucket).padEnd(24)} ok=${r.ok} ${(r.error ?? '').slice(0, 90)}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[diagnose-stats-cache] fatal', err)
    process.exit(1)
  })
