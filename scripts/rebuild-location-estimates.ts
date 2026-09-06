#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { runLocationEstimateOvernight } from '../lib/listing-location-estimates-overnight'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

/**
 * Slow overnight pass over Active inventory. Writes listing_location_estimates
 * and a snapshot row. Limit/pause keep it from competing with town stats.
 *
 *   npm run estimates:location
 *   LOCATION_ESTIMATE_LIMIT=20 LOCATION_ESTIMATE_PAUSE_MS=2000 npm run estimates:location
 */
async function main() {
  const limit = Number(process.env.LOCATION_ESTIMATE_LIMIT ?? '40')
  const pauseMs = Number(process.env.LOCATION_ESTIMATE_PAUSE_MS ?? '1500')
  console.info(
    `[location-estimates] overnight start — limit ${limit}, pause ${pauseMs}ms`,
  )
  const result = await runLocationEstimateOvernight({ limit, pauseMs })
  console.info(
    `[location-estimates] done — wrote ${result.written}, skipped fresh ${result.skippedFresh}, considered ${result.considered}, towns ${result.towns.join(', ') || '—'}`,
  )
}

main().catch((err) => {
  console.error('[location-estimates] fatal', err)
  process.exit(1)
})
