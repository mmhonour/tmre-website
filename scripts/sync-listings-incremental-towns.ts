/**
 * Local Incremental for named towns only (postHooks off).
 * Usage: npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/sync-listings-incremental-towns.ts Weston Ridgefield
 */
import { existsSync } from 'node:fs'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import { syncIncrementalListings } from '../lib/listings-sync'
import type { TmreTown } from '../lib/tmre-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const towns = process.argv.slice(2).filter((a) => !a.startsWith('-')) as TmreTown[]
  if (towns.length === 0) {
    console.error('Usage: … towns.ts <Town>…')
    process.exit(2)
  }
  await hydrateSyncMetaStore()
  console.info('[towns-incremental] starting', towns.join(', '))
  const result = await syncIncrementalListings({
    postHooks: false,
    towns,
    stepLogSource: 'cli',
  })
  for (const row of result.towns) {
    console.info(
      row.ok
        ? `  ${row.town}: ${row.count} upserts (${row.inserted ?? 0} new, ${row.updated ?? 0} updated) ${row.durationMs}ms`
        : `  ${row.town}: FAILED ${row.error ?? ''}`,
    )
  }
  console.info(
    `done modifiedAfter=${result.modifiedAfter} finishedAt=${result.finishedAt} totalUpserted=${result.totalUpserted}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
