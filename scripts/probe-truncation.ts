#!/usr/bin/env node
/**
 * Does the fetch limit silently drop MLS rows — specifically today's new ones?
 *
 * Runs the exact incremental Active query twice per town, once at the configured
 * limit and once at a high ceiling, and diffs the results. RETS has no pagination
 * (lib/rets.ts searchListings issues one offset:1 query with no ORDER BY), so a
 * result count equal to the limit means the surplus was discarded silently.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/probe-truncation.ts
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/probe-truncation.ts --town Norwalk --low 250 --high 2000
 */
import { existsSync } from 'node:fs'
import { searchListings } from '../lib/rets'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import { getActiveListingsFetchLimit } from '../lib/listings-store'
import { incrementalWatermark } from '../lib/listings-sync'
import { TMRE_TOWNS, type TmreTown } from '../lib/tmre-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return null
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : null
}

function todayEt(): string {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
  )
    .toISOString()
    .slice(0, 10)
}

async function main() {
  await hydrateSyncMetaStore()
  const configured = getActiveListingsFetchLimit()
  const low = Number(arg('low') ?? configured) || configured
  const high = Number(arg('high') ?? '2000') || 2000
  const modifiedAfter = incrementalWatermark()
  const townArg = arg('town')
  const towns = (townArg ? [townArg] : [...TMRE_TOWNS]) as TmreTown[]
  const today = todayEt()

  console.info(`configured active_listings_fetch_limit = ${configured}`)
  console.info(`modifiedAfter = ${modifiedAfter}`)
  console.info(`comparing limit ${low} vs ${high}, ET today = ${today}\n`)
  console.info(
    'town             low  high  dropped  newToday@low  newToday@high  truncated',
  )
  console.info(
    '---------------------------------------------------------------------------',
  )

  for (const town of towns) {
    const [lowRows, highRows] = await Promise.all([
      searchListings({ city: town, status: 'Active', limit: low, modifiedAfter }),
      searchListings({ city: town, status: 'Active', limit: high, modifiedAfter }),
    ])
    const newToday = (rows: typeof lowRows) =>
      rows.filter((l) => (l.listDate ?? '').slice(0, 10) === today).length
    const dropped = highRows.length - lowRows.length
    console.info(
      [
        town.padEnd(16),
        String(lowRows.length).padStart(4),
        String(highRows.length).padStart(6),
        String(dropped).padStart(8),
        String(newToday(lowRows)).padStart(13),
        String(newToday(highRows)).padStart(14),
        lowRows.length >= low ? '   YES ***' : '   no',
      ].join(''),
    )
  }

  console.info(
    '\nnewToday@high greater than newToday@low means the current limit is hiding listings that went Active today.',
  )

  // The MLS side of the corroboration test: what RETS says went Active today,
  // to diff against an MLS-generated list by number and address.
  if (process.argv.includes('--list')) {
    console.info(`\n--- MLS reports Active with ListingContractDate = ${today} ---`)
    for (const town of towns) {
      const rows = await searchListings({
        city: town,
        status: 'Active',
        limit: high,
        modifiedAfter,
      })
      const todays = rows.filter(
        (l) => (l.listDate ?? '').slice(0, 10) === today,
      )
      if (todays.length === 0) continue
      console.info(`\n${town} (${todays.length})`)
      for (const l of todays) {
        console.info(
          `  ${l.mlsId.padEnd(10)} ${(l.address.full || '(no address)').padEnd(40)} $${l.price ?? '—'} status=${l.status}`,
        )
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
