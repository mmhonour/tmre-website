import 'server-only'

import { Pool, type PoolClient, type QueryResultRow } from 'pg'

// ---------------------------------------------------------------------------
// Postgres (Neon) connection layer — Phase 2 of the SQLite → Postgres migration.
//
// This is the async replacement for the better-sqlite3 connection/query layer in
// lib/listings-db.ts. Everything Postgres goes through this single module so the
// driver choice (currently node-postgres `pg` against Neon's pooled endpoint) is a
// one-file swap if we later move to @neondatabase/serverless.
//
// A single Pool is reused across invocations. On Netlify the pooled Neon endpoint
// (the `-pooler` host) plus PgBouncer handles connection reuse across warm Lambdas.
// ---------------------------------------------------------------------------

let pool: Pool | null = null

/**
 * App runtime uses the POOLED connection (DATABASE_URL). Migrations/DDL use the
 * direct/unpooled one (see scripts/run-migrations.mjs) — not this module.
 */
function resolveConnectionString(): string {
  const cs =
    process.env.DATABASE_URL?.trim() ||
    process.env.NETLIFY_DATABASE_URL?.trim() ||
    ''
  if (!cs) {
    throw new Error(
      'DATABASE_URL is not set — Postgres is unavailable. Add the pooled Neon connection ' +
        'string to .env.local (and the Netlify site env).',
    )
  }
  return cs
}

/**
 * Strip libpq-style TLS query params and configure TLS on the driver instead.
 * This keeps the connection encrypted while silencing node-postgres's `sslmode`
 * deprecation warning.
 */
function buildPoolConfig() {
  const raw = resolveConnectionString()
  let connectionString = raw
  try {
    const url = new URL(raw)
    url.searchParams.delete('sslmode')
    url.searchParams.delete('channel_binding')
    connectionString = url.toString()
  } catch {
    // If it isn't a parseable URL, fall back to the raw string as-is.
  }
  return {
    connectionString,
    ssl: { rejectUnauthorized: false as const },
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }
}

export function getPool(): Pool {
  if (pool) return pool
  pool = new Pool(buildPoolConfig())
  pool.on('error', (err) => {
    // Idle client errors must be handled or they crash the process.
    console.error('[postgres] idle client error:', err instanceof Error ? err.message : err)
  })
  return pool
}

/** Run a query and return all rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[] | undefined)
  return result.rows
}

/** Run a query and return the first row, or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** Run a query for its side effect and return the affected row count. */
export async function execute(text: string, params?: readonly unknown[]): Promise<number> {
  const result = await getPool().query(text, params as unknown[] | undefined)
  return result.rowCount ?? 0
}

/**
 * Run `fn` inside a single transaction on one dedicated client. Commits on
 * success, rolls back on any throw. Use for multi-statement sync upserts.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback failure — surface the original error
    }
    throw err
  } finally {
    client.release()
  }
}

/** Lightweight connectivity check for admin diagnostics / scripts. */
export async function pingDatabase(): Promise<{
  ok: boolean
  now?: string
  serverVersion?: string
  error?: string
}> {
  try {
    const row = await queryOne<{ now: string; version: string }>(
      'SELECT now()::text AS now, version() AS version',
    )
    return { ok: true, now: row?.now, serverVersion: row?.version }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Close the pool (graceful shutdown / test teardown). */
export async function closePool(): Promise<void> {
  if (!pool) return
  const current = pool
  pool = null
  await current.end()
}
