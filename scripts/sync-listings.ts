#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { shouldSkipListingsSyncAtBuild } from '../lib/build-sync-gate'
import { syncAllTownListings } from '../lib/listings-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  if (shouldSkipListingsSyncAtBuild()) {
    console.info(
      '[sync-listings] skipping full town sync on Netlify build (use scheduled functions or run locally)',
    )
    return
  }

  console.info('[sync-listings] starting full town sync…')
  const result = await syncAllTownListings()
  const failed = result.towns.filter((row) => !row.ok)
  for (const row of result.towns) {
    const status = row.ok ? `${row.count} listings` : `FAILED: ${row.error}`
    console.info(`  ${row.town} ${row.statusBucket}: ${status} (${row.durationMs}ms)`)
  }
  console.info(
    `[sync-listings] done in ${result.durationMs}ms — ${result.totalUpserted} total upserts`,
  )
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[sync-listings] fatal', err)
  process.exit(1)
})
