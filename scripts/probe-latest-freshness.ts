#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'
import { getSyncMeta as getSyncMetaFresh } from '../lib/db/sync-meta'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const keys = [
    'last_incremental_sync',
    'last_incremental_sync_started',
    'last_latest_town_feeds',
    'last_refresh_finished_at',
  ]
  for (const k of keys) {
    console.info(`${k} = ${(await getSyncMetaFresh(k)) ?? '(null)'}`)
  }

  const rows = await query<{ key: string; updated_at: string | null }>(
    `SELECT key, updated_at::text
     FROM stats_cache
     WHERE key LIKE 'latest%' OR key LIKE '%town-feed%' OR key LIKE 'latest-feed%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 30`,
  )
  console.info('--- stats_cache latest-ish rows ---')
  if (rows.length === 0) console.info('(none)')
  for (const r of rows) {
    console.info(`${r.updated_at ?? '(no updated_at)'} | ${r.key}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
