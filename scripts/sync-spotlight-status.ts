#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { refreshSpotlightStatuses } from '../lib/spotlight-status-sync'
import { isRetsConfigured } from '../lib/rets'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  if (!isRetsConfigured()) {
    console.error('[sync-spotlight-status] RETS_* not configured — nothing to poll')
    process.exitCode = 1
    return
  }

  console.info('[sync-spotlight-status] refreshing spotlight listing statuses from RETS…')
  const result = await refreshSpotlightStatuses()
  console.info(
    `[sync-spotlight-status] done — refreshed ${result.refreshed}/${result.ids.length}` +
      (result.failed ? ` (${result.failed} failed)` : ''),
  )
  for (const id of result.ids) {
    console.info(`  · ${id}`)
  }
  if (!result.ok) process.exitCode = 1
}

main().catch((err) => {
  console.error('[sync-spotlight-status] fatal', err)
  process.exit(1)
})
