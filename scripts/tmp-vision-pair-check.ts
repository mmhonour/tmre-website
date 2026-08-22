/**
 * Read-only sanity check for the listing ↔ vision_addresses pairing shown in the
 * listing Admin panel. Prints stamp coverage for Westport and a few samples.
 *
 *   npx tsx scripts/tmp-vision-pair-check.ts
 */
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

// VISION_SYNC_TARGET=neon reads prod, matching scripts/match-vision-listings.ts.
if (/^(neon|prod)$/i.test(process.env.VISION_SYNC_TARGET?.trim() ?? '')) {
  const neon = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#\s*/, ''))
    .map((line) =>
      /^(?:DATABASE_URL|NETLIFY_DATABASE_URL)\s*=\s*(.*)$/.exec(line)?.[1],
    )
    .map((value) => value?.trim().replace(/^['"]|['"]$/g, ''))
    .find((value) => value?.includes('neon.tech'))
  if (!neon) throw new Error('No neon.tech URL in .env.local')
  process.env.DATABASE_URL = neon
}

// Imported after DATABASE_URL is settled so the pool picks up the right target.
const dbPromise = import('../lib/db/postgres')

async function main() {
  const { query } = await dbPromise
  const coverage = await query<{
    status_bucket: string
    total: string
    stamped: string
  }>(
    `SELECT status_bucket,
            count(*)::text AS total,
            count(vision_pid)::text AS stamped
       FROM listings
      WHERE town = 'Westport'
      GROUP BY status_bucket
      ORDER BY status_bucket`,
  )
  console.log('Westport listings — vision_pid coverage by bucket')
  for (const row of coverage) {
    const total = Number(row.total)
    const stamped = Number(row.stamped)
    const pct = total ? ((stamped / total) * 100).toFixed(1) : '0.0'
    console.log(`  ${row.status_bucket.padEnd(14)} ${stamped}/${total} (${pct}%)`)
  }

  const samples = await query<{
    mls_id: string
    address_street: string | null
    vision_pid: string | null
    address_full: string | null
    owner_name: string | null
    assessed_value: number | null
    back_mls: string | null
  }>(
    `SELECT l.mls_id, l.address_street, l.vision_pid,
            v.address_full, v.owner_name, v.assessed_value, v.mls_id AS back_mls
       FROM listings l
       LEFT JOIN vision_addresses v
              ON v.town = 'Westport' AND v.vision_pid = l.vision_pid
      WHERE l.town = 'Westport' AND l.status_bucket = 'Active'
      ORDER BY l.vision_pid IS NULL, l.mls_id
      LIMIT 8`,
  )
  console.log('\nSamples (stamped first)')
  for (const s of samples) {
    console.log(
      `  #${s.mls_id} ${s.address_street ?? '—'}\n     pid=${s.vision_pid ?? '—'} row=${
        s.address_full ?? '—'
      } owner=${s.owner_name ?? '—'} assessed=${s.assessed_value ?? '—'} back=${
        s.back_mls ?? '—'
      }`,
    )
  }

  // End-to-end: the same read + resolver the listing / spotlight payloads use.
  const { readListingByIdFromDb } = await import('../lib/db/listings-repo')
  const { resolveListingVisionLink } = await import('../lib/listing-vision-link')
  const probes = await query<{ mls_id: string }>(
    `SELECT mls_id FROM listings
      WHERE town = 'Westport' AND status_bucket = 'Active'
      ORDER BY vision_pid IS NULL, mls_id
      LIMIT 2`,
  )
  const unstamped = await query<{ mls_id: string }>(
    `SELECT mls_id FROM listings
      WHERE town = 'Westport' AND status_bucket = 'Active' AND vision_pid IS NULL
      ORDER BY mls_id
      LIMIT 2`,
  )
  console.log('\nResolver output')
  for (const { mls_id } of [...probes, ...unstamped]) {
    const listing = await readListingByIdFromDb(mls_id)
    const link = listing ? await resolveListingVisionLink(listing) : null
    console.log(
      `  #${mls_id} ${listing?.address.street ?? '—'} visionPid=${
        listing?.visionPid ?? '—'
      }`,
    )
    console.log(`     ${JSON.stringify(link)}`)
  }

  const dangling = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM listings l
      WHERE l.town = 'Westport'
        AND l.vision_pid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM vision_addresses v
           WHERE v.town = 'Westport' AND v.vision_pid = l.vision_pid
        )`,
  )
  console.log(`\nStamped PIDs with no vision_addresses row: ${dangling[0]?.n ?? '?'}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
