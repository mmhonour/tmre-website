#!/usr/bin/env node
/**
 * Build today's Market Pulse snapshot and store it. Does not send email.
 *
 *   npm run snapshot:market-pulse
 */
import { existsSync } from 'node:fs'

import { getSyncMeta } from '../lib/db/sync-meta'
import { closePool } from '../lib/db/postgres'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import { MARKET_DIGEST_LAST_SENT_KEY } from '../lib/market-digest-config'
import { buildMarketDigestSnapshot } from '../lib/market-digest'
import { recordMarketPulseSnapshot } from '../lib/market-pulse-snapshot-record'
import { readMarketPulseSnapshot } from '../lib/db/market-pulse-snapshots-repo'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  await hydrateSyncMetaStore()
  const snapshot = await buildMarketDigestSnapshot({
    includeClosedTrailing: true,
  })
  const lastSent = (await getSyncMeta(MARKET_DIGEST_LAST_SENT_KEY)) ?? null
  const { slotDate } = await recordMarketPulseSnapshot({
    snapshot,
    source: 'backfill',
    sentAt: lastSent,
  })
  const stored = await readMarketPulseSnapshot(slotDate)
  const towns = snapshot.towns.length
  const months = snapshot.market?.monthsSupply ?? null
  console.info(
    `[market-pulse-snapshot] stored slot=${slotDate} generated=${snapshot.generatedAt} towns=${towns} monthsSupply=${months ?? 'n/a'} source=${stored?.source ?? 'backfill'}`,
  )
}

main()
  .catch((err) => {
    console.error('[market-pulse-snapshot] fatal', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => {})
  })
