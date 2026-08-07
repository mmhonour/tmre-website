import { query } from '../lib/db/postgres'

async function main() {
  const cols = await query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_name = 'listings'
      ORDER BY ordinal_position`,
  )

  const perTown = await query<{
    town: string
    addresses: string
    streets: string
    active: string
  }>(
    `WITH a AS (
       SELECT COALESCE(address_city, data->'address'->>'city') AS town,
              lower(trim(COALESCE(address_street, data->'address'->>'street'))) AS street_line,
              status_bucket
         FROM listings
        WHERE COALESCE(address_street, data->'address'->>'street') IS NOT NULL
     )
     SELECT town,
            count(DISTINCT street_line)::text AS addresses,
            count(DISTINCT regexp_replace(street_line, '^[0-9]+[a-z]?\\s+', ''))::text AS streets,
            count(*) FILTER (WHERE status_bucket = 'Active')::text AS active
       FROM a
      GROUP BY town
      ORDER BY count(DISTINCT street_line) DESC`,
  )

  const totals = await query<{
    distinct_addresses: string
    distinct_streets: string
    payload_bytes: string
  }>(
    `WITH a AS (
       SELECT DISTINCT
              lower(trim(COALESCE(address_street, data->'address'->>'street'))) AS street_line,
              COALESCE(address_city, data->'address'->>'city') AS town
         FROM listings
        WHERE COALESCE(address_street, data->'address'->>'street') IS NOT NULL
     )
     SELECT count(*)::text AS distinct_addresses,
            count(DISTINCT regexp_replace(street_line, '^[0-9]+[a-z]?\\s+', ''))::text AS distinct_streets,
            sum(length(street_line) + length(COALESCE(town, '')) + 12)::text AS payload_bytes
       FROM a`,
  )

  const treadwell = await query<{ street_line: string; town: string; n: string }>(
    `SELECT lower(trim(COALESCE(address_street, data->'address'->>'street'))) AS street_line,
            COALESCE(address_city, data->'address'->>'city') AS town,
            count(*)::text AS n
       FROM listings
      WHERE lower(COALESCE(address_street, data->'address'->>'street')) LIKE '%treadwell%'
      GROUP BY 1, 2
      ORDER BY 1`,
  )

  console.log(
    JSON.stringify(
      { cols: cols.map((c) => c.column_name), perTown, totals, treadwellRows: treadwell.length, treadwell },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
