#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const [mods36] = await query<{ newest: string | null; n: number }>(
    `SELECT MAX(modification_timestamp)::text AS newest, COUNT(*)::int AS n
     FROM listings
     WHERE status_bucket = 'Active'
       AND modification_timestamp > NOW() - INTERVAL '36 hours'`,
  )
  const [newestAll] = await query<{ newest_all: string | null }>(
    `SELECT MAX(modification_timestamp)::text AS newest_all
     FROM listings
     WHERE status_bucket = 'Active'`,
  )
  const [listed36] = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM listings
     WHERE status_bucket = 'Active'
       AND list_date > NOW() - INTERVAL '36 hours'`,
  )
  console.info('newest_active_mod_any =', newestAll?.newest_all ?? '(null)')
  console.info('active_with_mod_in_last_36h =', mods36?.n ?? 0, 'newest=', mods36?.newest ?? '(null)')
  console.info('active_with_list_date_in_last_36h =', listed36?.n ?? 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
