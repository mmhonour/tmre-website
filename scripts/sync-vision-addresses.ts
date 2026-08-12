/**
 * CLI: chunked Vision GIS crawl → vision_addresses.
 * Usage: npm run sync:vision-addresses
 * Env: VISION_SYNC_TOWN, VISION_SYNC_MAX_PARCELS, VISION_SYNC_FORCE_FULL=1
 */
import { existsSync } from 'node:fs'
import { syncVisionAddresses } from '../lib/vision-gis-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const town = process.env.VISION_SYNC_TOWN?.trim() || undefined
  const maxRaw = Number(process.env.VISION_SYNC_MAX_PARCELS ?? '')
  const maxParcels = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 40
  const forceFull = process.env.VISION_SYNC_FORCE_FULL === '1'

  console.info(
    `[sync-vision-addresses] starting${town ? ` town=${town}` : ''} maxParcels=${maxParcels}${forceFull ? ' forceFull' : ''}…`,
  )
  const result = await syncVisionAddresses({
    town,
    maxParcels,
    forceFull,
  })
  console.info(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main().catch((err) => {
  console.error('[sync-vision-addresses] fatal', err)
  process.exit(1)
})
