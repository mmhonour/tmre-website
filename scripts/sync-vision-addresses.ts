/**
 * CLI: chunked Vision GIS crawl → vision_addresses.
 * Usage:
 *   $env:VISION_SYNC_TOWN='Westport'
 *   $env:VISION_SYNC_MAX_PARCELS='200'   # default 40; hard cap 200
 *   npm run sync:vision-addresses
 *
 * Per-parcel lines log as the crawl runs. scraped_at is always UTC.
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
    `[sync-vision-addresses] starting${town ? ` town=${town}` : ''} maxParcels=${maxParcels}${forceFull ? ' forceFull' : ''}…` +
      ` (each parcel logs as it runs; scraped_at = UTC)`,
  )
  if (maxParcels === 40 && !process.env.VISION_SYNC_MAX_PARCELS?.trim()) {
    console.info(
      '[sync-vision-addresses] tip: set VISION_SYNC_MAX_PARCELS=200 for a larger local fill chunk (Admin/Netlify stay at 40)',
    )
  }
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
