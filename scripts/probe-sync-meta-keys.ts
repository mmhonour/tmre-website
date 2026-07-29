#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { getAllSyncMeta } from '../lib/db/sync-meta'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const all = await getAllSyncMeta()
  const keys = Object.keys(all)
    .filter((k) => /incremental|refresh|step/i.test(k))
    .sort()
  for (const k of keys) {
    const v = all[k] ?? ''
    console.info(`${k} = ${v.length > 120 ? `${v.slice(0, 120)}… (${v.length} chars)` : v || '(empty)'}`)
  }
  console.info(`--- total sync_meta keys: ${Object.keys(all).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
