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
  // Local Postgres (localhost / sslmode=disable) speaks plain TCP; hosted
  // providers (Neon) require TLS. Match lib/db/postgres.ts.
  let useSsl = true
  try {
    const url = new URL(cs)
    if ((url.searchParams.get('sslmode') ?? '').toLowerCase() === 'disable') useSsl = false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') useSsl = false
  } catch {
    /* unparseable → default to TLS */
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
  return { connectionString, useSsl }
}

async function main() {
  const { connectionString, useSsl } = resolve()
  const client = new pg.Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
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

    try {
      const { rows: listings } = await client.query('SELECT count(*)::int AS n FROM listings')
      console.log(`[ping] listings rows: ${listings[0].n} (expected 0 until first sync)`)
    } catch {
      console.log('[ping] listings table not present yet — run `npm run db:migrate`')
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  const detail = err?.message?.trim() || err?.code || String(err)
  console.error('[ping] FAILED:', detail)
  if (err?.code) console.error('[ping] code   :', err.code)
  // Node's happy-eyeballs wraps IPv4/IPv6 connect failures in an AggregateError
  // whose top-level message is often blank — surface each underlying error.
  if (Array.isArray(err?.errors)) {
    for (const e of err.errors) {
      console.error(`[ping]   - ${e?.code ?? ''} ${e?.message ?? e} ${e?.address ?? ''}:${e?.port ?? ''}`)
    }
  }
  console.error('[ping] hint   : if all show ECONNREFUSED, Postgres is not listening on that host/port; ' +
    'if "password authentication failed", the postgres password is not "postgres" — tell me and I\'ll update .env.local.')
  process.exit(1)
})
