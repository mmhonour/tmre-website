#!/usr/bin/env node
/** Quick prod meta probe for Incremental debugging. */
import { existsSync } from 'node:fs'
import { hydrateSyncMetaStore, getSyncMeta } from '../lib/db/sync-meta-store'
import {
  formatIncrementalStepLog,
  readIncrementalStepLog,
} from '../lib/incremental-sync-step-log'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  await hydrateSyncMetaStore()
  const keys = [
    'last_incremental_sync_started',
    'last_incremental_sync',
    'last_incremental_cron_tick',
    'incremental_sync_live',
    'last_incremental_step_log',
    'refresh_in_progress',
  ]
  for (const k of keys) {
    const v = getSyncMeta(k)
    if (k === 'last_incremental_step_log' || k === 'incremental_sync_live') {
      console.info(`${k}=`)
      console.info(v ? v.slice(0, 800) : '(null)')
      console.info('---')
      continue
    }
    console.info(`${k}= ${v ?? '(null)'}`)
  }
  console.info('formatted step log:')
  console.info(formatIncrementalStepLog(readIncrementalStepLog()))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
