#!/usr/bin/env node
/**
 * Reconciliation primitive: given MLS numbers from an MLS-generated list, report
 * exactly what Postgres holds for each — or that it is missing.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/probe-mls-ids.ts 24195349 24194745 ...
 */
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a))
  if (ids.length === 0) {
    console.error('usage: probe-mls-ids.ts <mlsId> [mlsId ...]')
    process.exit(1)
  }

  const rows = await query<{
    mls_id: string
    town: string
    mls_status: string | null
    status_bucket: string
    address_full: string | null
    price: number | null
    list_date: string | null
    modification_timestamp: string | null
    status_change_timestamp: string | null
  }>(
    `SELECT mls_id, town, mls_status, status_bucket, address_full, price,
            list_date::text, modification_timestamp::text, status_change_timestamp::text
       FROM listings
      WHERE mls_id = ANY($1::text[])`,
    [ids],
  )

  const byId = new Map(rows.map((r) => [r.mls_id, r]))
  console.info(`checked ${ids.length} MLS numbers against Postgres\n`)
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) {
      console.info(`${id}  MISSING from Postgres`)
      continue
    }
    console.info(
      `${id}  ${row.status_bucket}/${row.mls_status ?? '—'}  ${row.town}  ${(row.address_full ?? '').slice(0, 34).padEnd(34)} list=${(row.list_date ?? '—').slice(0, 10)} statusChg=${(row.status_change_timestamp ?? '—').slice(0, 16)} mod=${(row.modification_timestamp ?? '—').slice(0, 16)}`,
    )
  }

  const missing = ids.filter((id) => !byId.has(id))
  console.info(
    `\npresent ${byId.size}/${ids.length}${missing.length ? ` — missing: ${missing.join(', ')}` : ' — all present'}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
