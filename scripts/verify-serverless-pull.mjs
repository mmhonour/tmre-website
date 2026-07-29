#!/usr/bin/env node
/**
 * Proves — against real production Lambdas — whether the MLS pull can work on
 * serverless, before we change any sync code.
 *
 *   node scripts/verify-serverless-pull.mjs
 *   node scripts/verify-serverless-pull.mjs --base https://<site>.netlify.app
 *   node scripts/verify-serverless-pull.mjs --town Norwalk --limit 2000
 *   node scripts/verify-serverless-pull.mjs --defer      # fire-and-forget survival test
 *
 * Reads SYNC_CRON_SECRET + site URL from .env.local unless flags are given.
 * Read-only: the endpoint never upserts inventory.
 */
import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const TOWNS = [
  'Norwalk',
  'New Canaan',
  'Westport',
  'Wilton',
  'Weston',
  'Fairfield',
  'Ridgefield',
]

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const BASE = String(
  arg('base') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    'https://tmrebuilder.com',
).replace(/\/$/, '')
const SECRET = process.env.SYNC_CRON_SECRET?.trim() ?? ''
const ENDPOINT = `${BASE}/.netlify/functions/sync-diagnose`

async function call(params) {
  const url = new URL(ENDPOINT)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }
  const started = Date.now()
  const res = await fetch(url, {
    headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { parseError: text.slice(0, 400) }
  }
  return { status: res.status, roundTripMs: Date.now() - started, body }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function deferTest() {
  console.log('\n=== Fire-and-forget survival test ===')
  console.log('Mirrors warmLatestTownFeedsDeferred: void promise + 1.5s sleep,')
  console.log('started before the handler returns.\n')
  const write = await call({ mode: 'defer-write' })
  console.log(`defer-write  HTTP ${write.status} (${write.roundTripMs}ms)`)
  if (write.status !== 200) {
    console.log(JSON.stringify(write.body, null, 2))
    return
  }
  console.log('waiting 30s for the marker to land…')
  await sleep(30_000)
  const check = await call({ mode: 'defer-check' })
  console.log(`defer-check  HTTP ${check.status}`)
  console.log(`landed: ${check.body?.deferredWriteLanded}`)
  console.log(`VERDICT: ${check.body?.verdict}`)
}

async function main() {
  console.log(`endpoint: ${ENDPOINT}`)
  console.log(`secret:   ${SECRET ? 'present' : 'MISSING (endpoint may 401)'}`)

  if (arg('defer')) {
    await deferTest()
    return
  }

  const only = arg('town')
  const limitOverride = arg('limit')
  const towns = typeof only === 'string' ? [only] : TOWNS

  const first = await call({
    town: towns[0],
    limit: limitOverride,
    status: arg('status'),
  })
  if (first.status !== 200) {
    console.error(`\nprobe failed — HTTP ${first.status}`)
    console.error(JSON.stringify(first.body, null, 2))
    process.exitCode = 1
    return
  }

  const r = first.body.runtime ?? {}
  console.log(
    `\nruntime:  lambda=${r.lambda} ${r.functionName ?? '—'} region=${r.region ?? '—'} node=${r.node ?? '—'}`,
  )
  console.log(
    `env:      DATABASE_URL=${r.databaseUrlPresent} RETS_LOGIN_URL=${r.retsLoginPresent} SYNC_CRON_SECRET=${r.cronSecretPresent}`,
  )
  const w = first.body.window ?? {}
  console.log(
    `window:   modifiedAfter=${w.modifiedAfter} (${w.lookbackHours}h) refreshInProgress=${w.refreshInProgress}`,
  )
  console.log(
    `watermark:last_incremental_sync=${w.lastIncrementalSync ?? '(none)'} last_full_sync=${w.lastFullSync ?? '(none)'}`,
  )
  const f = first.body.feedCache ?? {}
  console.log(
    `feed:     /latest cache generatedAt=${f.generatedAt ?? '(none)'} age=${f.ageMinutes ?? '—'}min listings=${f.listings ?? 0}`,
  )
  console.log(`write:    durable Neon write ok=${first.body.durableWrite?.ok}`)

  const results = [{ town: towns[0], body: first.body, ms: first.roundTripMs }]
  for (const town of towns.slice(1)) {
    const res = await call({ town, limit: limitOverride, status: arg('status') })
    results.push({ town, body: res.body, ms: res.roundTripMs })
  }

  console.log('\ntown            limit  pulled  market  neon36h  today  retsMs  truncated')
  console.log('-------------------------------------------------------------------------')
  for (const { town, body } of results) {
    const fe = body.fetch ?? {}
    const ne = body.neon ?? {}
    console.log(
      [
        town.padEnd(15),
        String(fe.limit ?? '—').padStart(5),
        String(fe.returned ?? '—').padStart(7),
        String(fe.afterMarketFilter ?? '—').padStart(7),
        String(ne.modifiedLast36h ?? '—').padStart(8),
        String(ne.listedToday ?? '—').padStart(6),
        String(body.timing?.retsMs ?? '—').padStart(7),
        fe.truncated ? '  YES ***' : '  no',
      ].join(''),
    )
  }

  const truncated = results.filter((x) => x.body?.fetch?.truncated)
  const slowest = Math.max(...results.map((x) => x.body?.timing?.retsMs ?? 0))

  console.log('\n=== VERDICT ===')
  console.log(
    `RETS reachable from Lambda: ${results.every((x) => x.body?.ok) ? 'YES' : 'NO'}`,
  )
  console.log(`slowest single-town RETS call: ${slowest}ms`)
  console.log(
    `7 towns x 5 statuses at that rate: ~${Math.round((slowest * 7 * 5) / 1000)}s ` +
      `(30s scheduled limit, ~900s background limit)`,
  )
  if (truncated.length > 0) {
    console.log(
      `\nTRUNCATION on ${truncated.length} town(s): ${truncated.map((x) => x.town).join(', ')}`,
    )
    console.log(
      'Re-run with --limit 2000 on one of those towns to see how many rows we are dropping.',
    )
  } else {
    console.log('\nNo truncation at the current limit.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
