#!/usr/bin/env node
/**
 * Local/dev incremental RETS pull — nuts and bolts: modified-since pull + upsert.
 * Skips post-hooks (board/stats warm) so we can review inventory movement alone.
 *
 * Usage (from repo root, with .env.local loaded):
 *   npm run sync:listings:incremental
 *
 * Also writes the durable step transcript to .tmp-incremental-step-log.txt
 * (same format as production dumps).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hydrateSyncMetaStore, getSyncMeta } from '../lib/db/sync-meta-store'
import {
  formatIncrementalStepLog,
  readIncrementalStepLog,
} from '../lib/incremental-sync-step-log'
import { syncIncrementalListings } from '../lib/listings-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const STEP_LOG_OUT = resolve(process.cwd(), '.tmp-incremental-step-log.txt')

async function main() {
  await hydrateSyncMetaStore()
  const beforeStarted = getSyncMeta('last_incremental_sync_started')
  const beforeFinished = getSyncMeta('last_incremental_sync')
  const beforeCron = getSyncMeta('last_incremental_cron_tick')

  console.info('[sync-listings-incremental] meta before:')
  console.info(`  last_incremental_sync_started = ${beforeStarted ?? '(null)'}`)
  console.info(`  last_incremental_sync         = ${beforeFinished ?? '(null)'}`)
  console.info(`  last_incremental_cron_tick    = ${beforeCron ?? '(null)'}`)
  console.info(
    '[sync-listings-incremental] starting RETS modified-since pull (postHooks=false)…',
  )

  const result = await syncIncrementalListings({
    postHooks: false,
    stepLogSource: 'cli',
  })
  const failed = result.towns.filter((row) => !row.ok)

  let totalInserted = 0
  let totalUpdated = 0
  // Columnar: "N upserts (a new, b updated) : Town\t:(ms)"
  const townLines = result.towns.map((row) => {
    const inserted = row.inserted ?? 0
    const updated = row.updated ?? 0
    totalInserted += inserted
    totalUpdated += updated
    if (!row.ok) {
      return {
        left: 'FAILED',
        town: row.town,
        right: row.error ?? 'unknown',
        durationMs: row.durationMs,
      }
    }
    return {
      left: `${row.count} upserts (${inserted} new, ${updated} updated)`,
      town: row.town,
      right: null as string | null,
      durationMs: row.durationMs,
    }
  })
  const leftWidth = Math.max(
    'upserts'.length,
    ...townLines.map((line) => line.left.length),
  )
  for (const line of townLines) {
    const left = line.left.padEnd(leftWidth)
    if (line.right) {
      console.info(`  ${left} : ${line.town}\t:(${line.durationMs}ms) — ${line.right}`)
      continue
    }
    console.info(`  ${left} : ${line.town}\t:(${line.durationMs}ms)`)
  }

  console.info(
    `[sync-listings-incremental] done in ${result.durationMs}ms — ${result.totalUpserted} upserts (${totalInserted} new, ${totalUpdated} updated) since ${result.modifiedAfter}`,
  )
  console.info('[sync-listings-incremental] meta after:')
  console.info(
    `  last_incremental_sync_started = ${getSyncMeta('last_incremental_sync_started') ?? '(null)'}`,
  )
  console.info(
    `  last_incremental_sync         = ${getSyncMeta('last_incremental_sync') ?? '(null)'}`,
  )
  console.info(
    `  last_incremental_cron_tick    = ${getSyncMeta('last_incremental_cron_tick') ?? '(null)'} (unchanged — CLI is not cron)`,
  )

  const stepText = formatIncrementalStepLog(readIncrementalStepLog())
  writeFileSync(STEP_LOG_OUT, stepText, 'utf8')
  console.info(`[sync-listings-incremental] step log → ${STEP_LOG_OUT}`)

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[sync-listings-incremental] fatal', err)
  process.exit(1)
})
