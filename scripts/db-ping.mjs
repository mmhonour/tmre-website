// Verifies the POOLED app connection (DATABASE_URL) works against Neon and that
// the migrated schema is present. The migration runner tests the unpooled/DDL
// connection; this tests the pooled connection the app uses at runtime.
//
//   npm run db:ping

import pg from 'pg'

function resolve() {
  const cs = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DATABASE_URL?.trim()
  if (!cs) {
    console.error('[ping] DATABASE_URL not set in .env.local')
    process.exit(1)
  }
  let connectionString = cs
  try {
    const url = new URL(cs)
    url.searchParams.delete('sslmode')
    url.searchParams.delete('channel_binding')
    connectionString = url.toString()
  } catch {
    /* use raw */
  }
  return connectionString
}

async function main() {
  const client = new pg.Client({
    connectionString: resolve(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const { rows: meta } = await client.query('SELECT now()::text AS now, version() AS version')
    console.log('[ping] connected (pooled)')
    console.log(`[ping] server time : ${meta[0].now}`)
    console.log(`[ping] version     : ${meta[0].version.split(',')[0]}`)

    const { rows: tables } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    console.log(`[ping] public tables: ${tables[0].n}`)

    const { rows: listings } = await client.query('SELECT count(*)::int AS n FROM listings')
    console.log(`[ping] listings rows: ${listings[0].n} (expected 0 until Phase 3 sync)`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[ping] FAILED:', err.message ?? err)
  process.exit(1)
})
