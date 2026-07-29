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
    town: string
    status_bucket: string
    listings_count: number
    ok: boolean
    error: string | null
  }>(
    `SELECT started_at, finished_at, town, status_bucket, listings_count, ok, error
     FROM sync_runs
     ORDER BY started_at DESC
     LIMIT 25`,
  )
  for (const r of rows) {
    console.info(
      `${r.started_at} → ${r.finished_at} | ${r.status_bucket} | ${r.town} | n=${r.listings_count} ok=${r.ok}${r.error ? ` | ${r.error}` : ''}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
