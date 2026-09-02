// Size + growth report for the Neon Postgres database.
//
// Answers three questions the Neon invoice does not:
//   1. How big is the database, and which tables hold it?
//   2. How fast is it growing per day, and what will that cost in storage?
//   3. What is querying it so often that the compute never scales to zero?
//
// Question 3 is usually the whole bill. Neon meters compute per CU-hour of
// *awake* time, not per query, and a compute stays awake as long as anything
// touches it more than once every 5 minutes. A cheap once-per-second poll and
// a heavy analytical query cost exactly the same if both keep it from sleeping.
//
//   npm run db:size

import pg from 'pg'

// Column that best marks "this row was born", most authoritative first. A table
// whose only timestamp is an update stamp (updated_at, last_seen) is skipped:
// counting those as births overstates growth on tables that upsert in place.
const BIRTH_COLUMNS = [
  'created_at',
  'first_seen',
  'first_viewed_at',
  'observed_at',
  'requested_at',
  'started_at',
  'scraped_at',
  'verified_at',
  'applied_at',
  'list_date',
  'synced_at',
  'computed_at',
]

function resolve() {
  const cs = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DATABASE_URL?.trim()
  if (!cs) {
    console.error('[size] DATABASE_URL not set in .env.local')
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

const GB = 1024 ** 3

function mb(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n)) return '—'
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} kB`
  return `${n} B`
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—'
}

function pad(text, width, align = 'left') {
  const s = String(text)
  if (s.length >= width) return s
  const fill = ' '.repeat(width - s.length)
  return align === 'right' ? fill + s : s + fill
}

function heading(title) {
  console.log(`\n${title}`)
  console.log('-'.repeat(title.length))
}

/** Per-table bytes and live row counts, largest first. */
async function tableSizes(client) {
  const { rows } = await client.query(`
    SELECT c.relname                                              AS table_name,
           pg_total_relation_size(c.oid)                          AS total_bytes,
           pg_indexes_size(c.oid)                                 AS index_bytes,
           COALESCE(pg_total_relation_size(c.reltoastrelid), 0)   AS toast_bytes,
           COALESCE(s.n_live_tup, 0)                              AS live_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `)
  return rows.map((row) => {
    const total = Number(row.total_bytes)
    const indexes = Number(row.index_bytes)
    const toast = Number(row.toast_bytes)
    return {
      table: row.table_name,
      total,
      indexes,
      toast,
      heap: Math.max(0, total - indexes - toast),
      rows: Number(row.live_rows),
    }
  })
}

/** Pick one birth-timestamp column per table, or null when none qualifies. */
async function birthColumns(client) {
  const { rows } = await client.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND data_type IN ('timestamp with time zone', 'timestamp without time zone')`,
  )
  const byTable = new Map()
  for (const row of rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set())
    byTable.get(row.table_name).add(row.column_name)
  }
  const picked = new Map()
  for (const [table, columns] of byTable) {
    const choice = BIRTH_COLUMNS.find((candidate) => columns.has(candidate))
    if (choice) picked.set(table, choice)
  }
  return picked
}

/**
 * Rows added in the trailing 1/7/30 days. Reported per table rather than summed,
 * because one chatty log table can dwarf every other row of real data.
 */
async function tableGrowth(client, table, column) {
  const { rows } = await client.query(`
    SELECT count(*)                                                             AS total,
           count(*) FILTER (WHERE "${column}" IS NULL)                          AS nulls,
           count(*) FILTER (WHERE "${column}" >= now() - interval '1 day')      AS d1,
           count(*) FILTER (WHERE "${column}" >= now() - interval '7 days')     AS d7,
           count(*) FILTER (WHERE "${column}" >= now() - interval '30 days')    AS d30,
           min("${column}")::text                                               AS oldest,
           max("${column}")::text                                               AS newest
    FROM "${table}"
  `)
  const row = rows[0]
  return {
    total: Number(row.total),
    nulls: Number(row.nulls),
    d1: Number(row.d1),
    d7: Number(row.d7),
    d30: Number(row.d30),
    oldest: row.oldest,
    newest: row.newest,
  }
}

/**
 * Call counts from pg_stat_statements. These reset whenever the compute
 * restarts, so the window is "since last wake" — which is exactly the right
 * window for asking why it has not gone back to sleep.
 */
async function chattiestQueries(client) {
  try {
    await client.query('SELECT 1 FROM pg_stat_statements LIMIT 1')
  } catch {
    return null
  }
  const { rows } = await client.query(`
    SELECT calls,
           rows,
           round(total_exec_time::numeric, 0) AS total_ms,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 110) AS query
    FROM pg_stat_statements
    WHERE calls > 0
    ORDER BY calls DESC
    LIMIT 12
  `)
  const { rows: uptime } = await client.query(
    `SELECT extract(epoch FROM (now() - pg_postmaster_start_time()))::bigint AS seconds`,
  )
  return { rows, uptimeSeconds: Number(uptime[0].seconds) }
}

/**
 * MLS inventory is the only table the user expects to grow as calendar time
 * moves: new listings appear, closings accumulate, actives turn over. Those
 * dates live on typed columns, so this is a real measurement rather than a
 * bytes-per-row estimate.
 */
async function listingsIncrement(client) {
  try {
    const { rows } = await client.query(`
      SELECT count(*)                                                         AS total,
             count(*) FILTER (WHERE status_bucket = 'Active')                 AS active,
             count(*) FILTER (WHERE status_bucket = 'Closed')                 AS closed,
             count(*) FILTER (WHERE list_date  >= now() - interval '1 day')   AS listed_1d,
             count(*) FILTER (WHERE list_date  >= now() - interval '7 days')  AS listed_7d,
             count(*) FILTER (WHERE list_date  >= now() - interval '30 days') AS listed_30d,
             count(*) FILTER (WHERE close_date >= now() - interval '1 day')   AS closed_1d,
             count(*) FILTER (WHERE close_date >= now() - interval '7 days')  AS closed_7d,
             count(*) FILTER (WHERE close_date >= now() - interval '30 days') AS closed_30d
      FROM listings
    `)
    return rows[0]
  } catch {
    return null
  }
}

function reportListings(row) {
  heading('MLS inventory (listings table)')
  if (!row) {
    console.log('listings table is not present.')
    return
  }
  const listedPerDay = Number(row.listed_30d) / 30
  const closedPerDay = Number(row.closed_30d) / 30
  console.log(
    `Rows: ${num(row.total)}  ·  Active: ${num(row.active)}  ·  Closed: ${num(row.closed)}`,
  )
  console.log(
    `Newly listed   24h ${num(row.listed_1d)}   7d ${num(row.listed_7d)}   30d ${num(row.listed_30d)}` +
      `   (~${num(Math.round(listedPerDay))}/day)`,
  )
  console.log(
    `Newly closed   24h ${num(row.closed_1d)}   7d ${num(row.closed_7d)}   30d ${num(row.closed_30d)}` +
      `   (~${num(Math.round(closedPerDay))}/day)`,
  )
  console.log(
    'Listings upsert in place, so the table grows by unique MLS ids (mostly new\n' +
      'closings that stay on file), not by every incremental RETS pull.',
  )
}

function reportSizes(sizes, dbBytes) {
  heading('Size by table')
  const width = Math.max(20, ...sizes.map((s) => s.table.length))
  console.log(
    `${pad('TABLE', width)}  ${pad('ROWS', 12, 'right')}  ${pad('TOTAL', 10, 'right')}` +
      `  ${pad('HEAP', 10, 'right')}  ${pad('TOAST', 10, 'right')}  ${pad('INDEXES', 10, 'right')}`,
  )
  for (const size of sizes) {
    if (size.total === 0) continue
    console.log(
      `${pad(size.table, width)}  ${pad(num(size.rows), 12, 'right')}  ${pad(mb(size.total), 10, 'right')}` +
        `  ${pad(mb(size.heap), 10, 'right')}  ${pad(mb(size.toast), 10, 'right')}  ${pad(mb(size.indexes), 10, 'right')}`,
    )
  }
  console.log(`\nDatabase total: ${mb(dbBytes)}  (storage at $0.35/GB-month = $${((Number(dbBytes) / GB) * 0.35).toFixed(2)}/mo)`)
}

function reportGrowth(growth) {
  heading('Growth (rows added, by birth timestamp)')
  if (growth.length === 0) {
    console.log('No table exposes a creation timestamp — nothing to measure.')
    return
  }
  const width = Math.max(20, ...growth.map((g) => g.table.length))
  console.log(
    `${pad('TABLE', width)}  ${pad('COLUMN', 16)}  ${pad('24H', 9, 'right')}  ${pad('7D', 9, 'right')}` +
      `  ${pad('30D', 10, 'right')}  ${pad('PER DAY', 9, 'right')}  ${pad('BYTES/DAY', 10, 'right')}`,
  )
  let bytesPerDay = 0
  const sparse = []
  for (const g of growth) {
    bytesPerDay += g.bytesPerDay
    console.log(
      `${pad(g.table, width)}  ${pad(g.column, 16)}  ${pad(num(g.d1), 9, 'right')}  ${pad(num(g.d7), 9, 'right')}` +
        `  ${pad(num(g.d30), 10, 'right')}  ${pad(num(Math.round(g.perDay)), 9, 'right')}  ${pad(mb(g.bytesPerDay), 10, 'right')}`,
    )
    // A column that is null on most rows dates only the minority that have it,
    // so its "per day" is a floor, not a measurement. Say so rather than let a
    // reassuring 0/day stand in for "we cannot tell".
    if (g.total > 0 && g.nulls / g.total > 0.2) {
      sparse.push(`${g.table}.${g.column} is null on ${Math.round((g.nulls / g.total) * 100)}% of rows`)
    }
  }
  const perYearGb = (bytesPerDay * 365) / GB
  console.log(
    `\nTotal growth: ${mb(bytesPerDay)}/day · ${mb(bytesPerDay * 30)}/month · ` +
      `${perYearGb.toFixed(2)} GB/year (+$${(perYearGb * 0.35).toFixed(2)}/mo of storage after a year)`,
  )
  console.log(
    'Bytes/day is rows/day scaled by that table\'s current bytes-per-row, so it tracks\n' +
      'width as well as count — a wide jsonb row costs far more per row than a counter.',
  )
  if (sparse.length > 0) {
    console.log('\nUndercounted — those rates are floors, not measurements:')
    for (const note of sparse) console.log(`  · ${note}`)
  }
}

function reportChatter(chatter) {
  heading('What keeps the compute awake')
  if (!chatter) {
    console.log(
      'pg_stat_statements is not enabled, so per-query call counts are unavailable.\n' +
        'Enable it with:  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
    )
    return
  }
  const { rows, uptimeSeconds } = chatter
  const hours = uptimeSeconds / 3600
  console.log(
    `Compute has been awake ${hours.toFixed(1)}h since it last started. ` +
      `Neon suspends after 5 idle minutes,\nso any query below running more often than that is what is paying for the awake hours.`,
  )
  // Under an hour of stats, one burst of activity extrapolates to a wild daily
  // figure. Show the raw counts and withhold the rate rather than print fiction.
  const canExtrapolate = hours >= 1
  if (!canExtrapolate) {
    console.log(
      'Window is under an hour, so per-day rates are withheld — re-run once the\n' +
        'compute has been up a while, or after SELECT pg_stat_statements_reset().',
    )
  }
  console.log('')
  console.log(`${pad('CALLS', 12, 'right')}  ${pad('CALLS/DAY', 11, 'right')}  ${pad('EVERY', 10, 'right')}  QUERY`)
  for (const row of rows) {
    const calls = Number(row.calls)
    const gap = calls > 0 && uptimeSeconds > 0 ? uptimeSeconds / calls : Infinity
    const every =
      canExtrapolate && Number.isFinite(gap)
        ? gap < 90
          ? `${gap.toFixed(1)}s`
          : `${(gap / 60).toFixed(1)}m`
        : '—'
    const rate = canExtrapolate ? num(Math.round((calls / hours) * 24)) : '—'
    console.log(
      `${pad(num(calls), 12, 'right')}  ${pad(rate, 11, 'right')}  ${pad(every, 10, 'right')}  ${row.query}`,
    )
  }
  const awakeCost = (cu, rate) => (730 * cu * rate).toFixed(0)
  console.log(
    `\nAn always-awake compute bills all 730 hours in a month:\n` +
      `  1 CU  → $${awakeCost(1, 0.106)}/mo on Launch · $${awakeCost(1, 0.222)}/mo on Scale\n` +
      `  2 CU  → $${awakeCost(2, 0.106)}/mo on Launch · $${awakeCost(2, 0.222)}/mo on Scale\n` +
      `  4 CU  → $${awakeCost(4, 0.106)}/mo on Launch · $${awakeCost(4, 0.222)}/mo on Scale`,
  )
}

async function main() {
  const { connectionString, useSsl } = resolve()
  const client = new pg.Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    const { rows: meta } = await client.query(
      `SELECT current_database() AS db, pg_database_size(current_database()) AS bytes`,
    )
    console.log(`[size] database: ${meta[0].db}`)

    const sizes = await tableSizes(client)
    reportSizes(sizes, meta[0].bytes)
    reportListings(await listingsIncrement(client))

    const byTable = new Map(sizes.map((s) => [s.table, s]))
    const picked = await birthColumns(client)
    const growth = []
    for (const [table, column] of picked) {
      const size = byTable.get(table)
      if (!size || size.rows === 0) continue
      try {
        const counts = await tableGrowth(client, table, column)
        if (counts.total === 0) continue
        const bytesPerRow = size.total / Math.max(1, counts.total)
        const perDay = counts.d30 / 30
        growth.push({ table, column, ...counts, perDay, bytesPerDay: perDay * bytesPerRow })
      } catch (err) {
        console.warn(`[size] growth check failed for ${table}.${column}: ${err?.message ?? err}`)
      }
    }
    growth.sort((a, b) => b.bytesPerDay - a.bytesPerDay)
    reportGrowth(growth)

    reportChatter(await chattiestQueries(client))
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[size] FAILED:', err?.message?.trim() || String(err))
  if (err?.code) console.error('[size] code   :', err.code)
  process.exit(1)
})
