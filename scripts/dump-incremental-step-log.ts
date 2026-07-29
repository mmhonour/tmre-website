#!/usr/bin/env node
/**
 * Pull the latest durable incremental step log from sync_meta (Neon) and write
 * a local text file for joint inspection.
 *
 *   npm run dump:incremental-step-log
 *
 * Writes: .tmp-incremental-step-log.txt
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hydrateSyncMetaStore } from '../lib/db/sync-meta-store'
import {
  formatIncrementalStepLog,
  readIncrementalStepLog,
} from '../lib/incremental-sync-step-log'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const OUT = resolve(process.cwd(), '.tmp-incremental-step-log.txt')

async function main() {
  await hydrateSyncMetaStore()
  const log = readIncrementalStepLog()
  const text = formatIncrementalStepLog(log)
  writeFileSync(OUT, text, 'utf8')
  console.info(`[dump-incremental-step-log] wrote ${OUT}`)
  console.info(text)
}

main().catch((err) => {
  console.error('[dump-incremental-step-log] fatal', err)
  process.exit(1)
})
