/** True during `next build` (not runtime server / serverless). */
export function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

/**
 * Skip heavy MLS sync in build scripts. Set `SKIP_LISTINGS_SYNC=1` in Netlify UI
 * to override, or rely on `NETLIFY=true` (set automatically on Netlify builds).
 */
export function shouldSkipListingsSyncAtBuild(): boolean {
  const flag = process.env.SKIP_LISTINGS_SYNC?.trim().toLowerCase()
  if (flag === '1' || flag === 'true' || flag === 'yes') return true
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  return process.env.NETLIFY === 'true'
}
