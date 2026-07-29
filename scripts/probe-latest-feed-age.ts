#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readStatsCacheRow } from '../lib/db/stats-cache-repo'
import { getSyncMeta } from '../lib/db/sync-meta'
import { LATEST_GLOBAL_FEED_CACHE_KEY } from '../lib/latest-feed-cache'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  console.info('last_latest_town_feeds =', (await getSyncMeta('last_latest_town_feeds')) ?? '(null)')
  console.info('last_latest_global_feed =', (await getSyncMeta('last_latest_global_feed')) ?? '(null)')
  console.info('last_incremental_sync =', (await getSyncMeta('last_incremental_sync')) ?? '(null)')

  // Read the key the live code reads — a hardcoded v1 here reported a dead row
  // as "stale feed" long after the cache key moved to v3.
  console.info('cache key =', LATEST_GLOBAL_FEED_CACHE_KEY)
  const row = await readStatsCacheRow(LATEST_GLOBAL_FEED_CACHE_KEY)
  if (!row?.payload) {
    console.info('global feed cache: (missing)')
    return
  }
  console.info('row computedAt =', row.computedAt || '(null)')
  const parsed = JSON.parse(row.payload) as {
    generatedAt?: string
    listings?: { modificationTimestamp?: string | null; listDate?: string | null; address?: string }[]
  }
  const listings = parsed.listings ?? []
  let newest: string | null = null
  for (const l of listings) {
    const m = l.modificationTimestamp
    if (!m) continue
    if (!newest || Date.parse(m) > Date.parse(newest)) newest = m
  }
  console.info('global feed generatedAt =', parsed.generatedAt ?? '(null)')
  console.info('global feed row count =', listings.length)
  console.info('global feed newest mod =', newest ?? '(null)')
  if (listings[0]) {
    console.info('top row =', listings[0].address, listings[0].modificationTimestamp)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
