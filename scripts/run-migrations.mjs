// Runs every db/migrations/*.sql file (in filename order) against Postgres/Neon.
//
// Connection string is read from env (first match wins):
//   DATABASE_URL_UNPOOLED  → preferred: direct/unpooled connection for DDL
//   NETLIFY_DATABASE_URL_UNPOOLED
//   DATABASE_URL
//   NETLIFY_DATABASE_URL
//
// Usage (loads .env.local automatically):
//   npm run db:migrate
//
// The .sql files are idempotent (CREATE ... IF NOT EXISTS) and each wraps itself
// in a transaction, so re-running is safe.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

function resolveConnectionString() {
  const candidates = [
    'DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL_UNPOOLED',
    'DATABASE_URL',
    'NETLIFY_DATABASE_URL',
  ]
  for (const key of candidates) {
    const value = process.env[key]?.trim()
    if (value) return { key, value }
  }
  return null
}

async function main() {
  const conn = resolveConnectionString()
  if (!conn) {
    console.error(
      '[migrate] No connection string found. Set DATABASE_URL_UNPOOLED (preferred) or ' +
        'DATABASE_URL in .env.local — use the DIRECT/unpooled Neon connection for DDL.',
    )
    process.exit(1)
  }
  console.log(`[migrate] Using ${conn.key}`)

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (files.length === 0) {
    console.error(`[migrate] No .sql files found in ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString: conn.value,
    // Neon requires TLS. rejectUnauthorized:false keeps this one-off runner from
    // failing on hosts that don't have Neon's CA chain locally.
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      process.stdout.write(`[migrate] Applying ${file} ... `)
      await client.query(sql)
      console.log('ok')
    }

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    )
    console.log(`[migrate] Done. Public tables (${rows.length}):`)
    for (const r of rows) console.log(`  - ${r.table_name}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message ?? err)
  process.exit(1)
})
