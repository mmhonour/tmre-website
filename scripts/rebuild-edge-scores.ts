#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { rebuildAllListingEdgeScores } from '../lib/listing-edge-score'
import { readListingsDbStats } from '../lib/db/listings-repo'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

/**
 * Rebuild the `listing_edge_scores` Postgres table from listings already in the
 * database — no RETS/network sync. This is the score source comparables read
 * (via attachStoredEdgeScores). Run it after a Postgres cutover/backfill when
 * inventory exists but comparables show "—" for scores.
 */
async function main() {
  console.info('[rebuild-edge-scores] reading listings from Postgres…')
  const before = await readListingsDbStats()
  console.info(
    `[rebuild-edge-scores] listings present: ${before.total} across ${Object.keys(before.byTown).length} towns`,
  )

  const result = await rebuildAllListingEdgeScores()
  console.info(
    `[rebuild-edge-scores] done — scored ${result.scored} listings into listing_edge_scores in ${result.durationMs}ms`,
  )

  if (result.scored === 0) {
    console.warn(
      '[rebuild-edge-scores] 0 scored — the listings table may be empty; run `npm run sync:listings` first',
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[rebuild-edge-scores] fatal', err)
  process.exit(1)
})
