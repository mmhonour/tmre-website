#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const rows = await query<{
    started_at: string
    finished_at: string
    status_bucket: string
    town: string
    listings_count: number
    ok: boolean
    err: string
  }>(
    `SELECT started_at, finished_at, status_bucket, town, listings_count, ok,
            left(coalesce(error, ''), 160) AS err
     FROM sync_runs
     WHERE started_at > NOW() - INTERVAL '20 minutes'
     ORDER BY started_at DESC
     LIMIT 40`,
  )
  if (rows.length === 0) {
    console.info('(no sync_runs in last 20 minutes)')
    return
  }
  for (const r of rows) {
    console.info(
      `${r.started_at} → ${r.finished_at} | ${r.status_bucket} | ${r.town} | n=${r.listings_count} ok=${r.ok}${r.err ? ` | ${r.err}` : ''}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
