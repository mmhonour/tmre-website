/**
 * Re-pull Active (+ Coming Soon) for every TMRE town using city∪zip search,
 * then rebuild the Intelligence deal-board cache.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local scripts/resync-active-intel.ts
 */
import { syncTownListings } from '../lib/listings-sync'
import { TMRE_TOWNS } from '../lib/tmre-towns'
import { rebuildIntelligenceDealBoardCache } from '../lib/intelligence-deal-board-cache'

async function main() {
  console.log('Re-syncing Active inventory (city ∪ zip)…')
  for (const town of TMRE_TOWNS) {
    const result = await syncTownListings(town, 'Active', { syncPhotos: false })
    console.log(
      `${town}: ${result.ok ? 'ok' : 'FAIL'} count=${result.count}${result.error ? ` ${result.error}` : ''} (${result.durationMs}ms)`,
    )
  }

  console.log('Rebuilding intelligence deal board…')
  const board = await rebuildIntelligenceDealBoardCache()
  console.log(
    `deal-board: ${board.towns} towns, ${board.listings} listings (${board.durationMs}ms)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
