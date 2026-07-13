#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { shouldSkipListingsSyncAtBuild } from '../lib/build-sync-gate'
import { syncAllTownListings, warmActiveListingPhotos } from '../lib/listings-sync'

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

  // The full-resync server path only defers a fire-and-forget photo warm, which
  // a one-shot CLI would exit before completing. Warm photos deterministically
  // here so the backfill actually lands every Active listing's photos in the
  // configured store (R2 in prod/local-with-R2, SQLite otherwise).
  console.info('[sync-listings] warming Active listing photos…')
  const photoWarm = await warmActiveListingPhotos({ concurrency: 2 })
  console.info(
    `[sync-listings] photo warm done — ${photoWarm.photos} images across ${photoWarm.listings} listings`,
  )

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[sync-listings] fatal', err)
  process.exit(1)
})
