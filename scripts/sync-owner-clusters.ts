/**
 * Backfill vision_owner_keys + cluster members from stored Field Cards.
 *
 *   npm run sync:owner-clusters
 */
import { existsSync } from 'node:fs'
import { fillMissingVisionOwnerKeys } from '../lib/db/vision-owner-clusters-repo'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const town = process.env.VISION_SYNC_TOWN?.trim() || 'Westport'
  const limit = Number(process.env.OWNER_CLUSTER_LIMIT ?? 400)
  const result = await fillMissingVisionOwnerKeys({ town, limit })
  console.log(
    `[owner-clusters] town=${town} scanned=${result.scanned} keyed=${result.keyed}`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
