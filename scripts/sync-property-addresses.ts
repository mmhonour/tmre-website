#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { syncPropertyAddresses } from '../lib/property-address-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  console.info('[sync-property-addresses] starting weekly verify…')
  const result = await syncPropertyAddresses()
  console.info(
    `[sync-property-addresses] done in ${result.durationMs}ms — ${result.totalRows} total (${result.mlsRows} MLS, ${result.assessorRows} assessor)`,
  )
  if (!result.ok) process.exitCode = 1
}

main().catch((err) => {
  console.error('[sync-property-addresses] fatal', err)
  process.exit(1)
})
