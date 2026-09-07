/**
 * Distinct trailing street tokens on listings.address_street vs the
 * Rd/Road review list in lib/street-type-abbreviations.ts.
 *
 *   npm run listing:street-suffixes
 */
import { existsSync } from 'node:fs'
import { query } from '../lib/db/postgres'
import {
  STREET_TYPE_ABBREVIATIONS,
  isStreetTypeToken,
} from '../lib/street-type-abbreviations'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

type SuffixRow = {
  suffix: string
  n: string
}

async function main() {
  const rows = await query<SuffixRow>(
    `SELECT lower(regexp_replace(btrim(address_street), '^.*\\s', '')) AS suffix,
            count(*)::text AS n
       FROM listings
      WHERE address_street IS NOT NULL
        AND btrim(address_street) ~ '\\s'
      GROUP BY 1
      ORDER BY count(*) DESC, suffix
      LIMIT 80`,
  )

  const known = new Set(
    STREET_TYPE_ABBREVIATIONS.flatMap((row) => [row.short, row.long]),
  )
  console.log('known pairs (review):')
  for (const row of STREET_TYPE_ABBREVIATIONS) {
    console.log(`  ${row.short.padEnd(6)} ↔ ${row.long.padEnd(12)}  rets ${row.rets}`)
  }
  console.log('')
  console.log('listings last-token counts:')
  for (const row of rows) {
    const mark = known.has(row.suffix)
      ? 'known'
      : isStreetTypeToken(row.suffix)
        ? 'known'
        : 'NEW'
    console.log(`  ${row.n.padStart(7)}  ${row.suffix}  ${mark}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
