#!/usr/bin/env node
/**
 * The corroboration test: what Neon believes went Active today, listing by
 * listing, so it can be diffed against an MLS "today's actives" list.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/probe-new-today.ts
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/probe-new-today.ts --days 3
 *
 * Note /latest is a "recently MODIFIED 30" feed, not "new today" — a listing new
 * today only appears there if it is among the 30 most recent modifications, so
 * comparing /latest against an MLS new-today list will under-report by design.
 */
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : fallback
}

async function main() {
  const days = Math.max(1, Number(arg('days', '1')) || 1)

  const rows = await query<{
    town: string
    mls_id: string
    address_full: string | null
    list_date: string | null
    modification_timestamp: string | null
    price: number | null
  }>(
    `SELECT town, mls_id, address_full, list_date::text, modification_timestamp::text, price
       FROM listings
      WHERE status_bucket = 'Active'
        AND list_date >= ((NOW() AT TIME ZONE 'America/New_York')::date - ($1::int - 1))
      ORDER BY town, list_date DESC`,
    [days],
  )

  const byTown = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byTown.get(r.town) ?? []
    list.push(r)
    byTown.set(r.town, list)
  }

  console.info(
    `Active listings with list_date within the last ${days} day(s), ET — total ${rows.length}\n`,
  )
  for (const [town, list] of [...byTown.entries()].sort()) {
    console.info(`${town} (${list.length})`)
    for (const r of list) {
      console.info(
        `  ${r.mls_id.padEnd(10)} ${(r.address_full ?? '(no address)').padEnd(38)} list=${r.list_date ?? '—'} mod=${r.modification_timestamp ?? '—'}`,
      )
    }
    console.info('')
  }

  // Clock sanity: RETS timestamps stored ahead of "now" means an ET/UTC mixup,
  // which shifts every freshness window and "new today" boundary.
  const [clock] = await query<{
    now_utc: string
    newest_mod: string | null
    future_rows: number
  }>(
    `SELECT NOW()::text AS now_utc,
            MAX(modification_timestamp)::text AS newest_mod,
            COUNT(*) FILTER (WHERE modification_timestamp > NOW() + INTERVAL '5 minutes')::int AS future_rows
       FROM listings
      WHERE status_bucket = 'Active'`,
  )
  console.info('--- clock check ---')
  console.info('now                =', clock?.now_utc ?? '—')
  console.info('newest modification=', clock?.newest_mod ?? '—')
  console.info('rows dated >5m in the future =', clock?.future_rows ?? 0)
  if ((clock?.future_rows ?? 0) > 0) {
    console.info(
      'WARNING: future-dated modification_timestamp means RETS local time is being stored as if UTC (or vice versa).',
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
