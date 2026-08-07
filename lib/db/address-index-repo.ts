import 'server-only'

import { query } from '@/lib/db/postgres'

export type AddressIndexSourceRow = {
  town: string
  street_line: string
  zip: string | null
  mls_id: string
  on_market: boolean
  is_rental: boolean
  price_k: number | null
  close_year: number | null
}

/**
 * One row per distinct (town, street line) across the whole listings table.
 * Active wins over closed history at the same address, and a sale wins over a
 * lease, so the index points at the listing a visitor would expect to open —
 * and a closed rent never gets rendered as a sale price.
 */
export async function readAddressIndexSourceRows(
  towns: readonly string[],
): Promise<AddressIndexSourceRow[]> {
  const townKeys = towns.map((town) => town.trim().toLowerCase()).filter(Boolean)
  if (townKeys.length === 0) return []

  return query<AddressIndexSourceRow>(
    `WITH src AS (
       SELECT
         COALESCE(NULLIF(trim(address_city), ''), data->'address'->>'city') AS town,
         trim(COALESCE(NULLIF(trim(address_street), ''), data->'address'->>'street')) AS street_line,
         left(COALESCE(NULLIF(trim(postal_code), ''), data->'address'->>'postalCode'), 5) AS zip,
         mls_id,
         status_bucket,
         COALESCE(property_type, '') ~* '(rental|for lease)' AS is_rental,
         COALESCE(close_price, price) AS price,
         close_date,
         modification_timestamp
       FROM listings
       WHERE mls_id IS NOT NULL
         AND COALESCE(NULLIF(trim(address_street), ''), data->'address'->>'street') IS NOT NULL
     ),
     ranked AS (
       SELECT
         src.*,
         row_number() OVER (
           PARTITION BY lower(town), lower(street_line)
           ORDER BY (status_bucket = 'Active') DESC,
                    is_rental ASC,
                    close_date DESC NULLS LAST,
                    modification_timestamp DESC NULLS LAST
         ) AS rn
       FROM src
       WHERE lower(town) = ANY($1::text[])
         AND street_line <> ''
         -- Placeholder street lines exist in the feed and read as broken
         -- suggestions ("N/A Main Street"), so they never enter the index.
         AND street_line ~ '[a-zA-Z]'
         AND lower(street_line) !~ '^(n/?a|tbd|unknown|none|to be determined)\y'
     )
     SELECT
       town,
       street_line,
       NULLIF(zip, '') AS zip,
       mls_id,
       (status_bucket = 'Active') AS on_market,
       is_rental,
       CASE WHEN price > 0 THEN round(price / 1000.0)::int ELSE NULL END AS price_k,
       CASE WHEN close_date IS NOT NULL THEN extract(year FROM close_date)::int ELSE NULL END AS close_year
     FROM ranked
     WHERE rn = 1
     ORDER BY lower(street_line), lower(town)`,
    [townKeys],
  )
}
