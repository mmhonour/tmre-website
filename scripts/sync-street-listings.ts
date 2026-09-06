#!/usr/bin/env node
import { existsSync } from 'node:fs'

import { syncStreetListings } from '../lib/street-listings-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const LOG = '[street-listings]'

type Args = {
  limit: number | null
  json: boolean
}

function parseArgs(argv: string[]): Args {
  let limit: number | null = null
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--limit') {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n)
      i += 1
    }
  }
  return { limit, json }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.info(`${LOG} starting`)
  const result = await syncStreetListings({
    ...(args.limit != null ? { limit: args.limit } : {}),
  })
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.info(`${LOG} ${result.detail}`)
    console.info(
      `${LOG} attempted=${result.attempted} ingested=${result.ingested} linked=${result.linked} missing=${result.missing} remaining=${result.remaining} ${result.durationMs}ms`,
    )
  }
  if (!result.ok) process.exitCode = 1
}

main().catch((err) => {
  console.error(`${LOG} failed`, err)
  process.exitCode = 1
})
