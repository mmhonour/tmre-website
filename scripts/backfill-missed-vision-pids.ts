/**
 * One-off: fill vision_pid for Westport SFR listings that the street crawl missed.
 *
 * Does NOT walk the full VGSI alphabet. Starts from listings:
 *
 *   SELECT address_street, * FROM listings
 *   WHERE vision_pid IS NULL
 *     AND town = 'Westport'
 *   ORDER BY address_street
 *
 * For each row: match existing vision_addresses, else fetch that street’s
 * VGSI page, ingest the house-number PID(s), then stamp listings.vision_pid.
 *
 * Dry-run (default):
 *   $env:VISION_SYNC_TARGET='neon'
 *   npm run backfill:missed-vision-pids
 *
 * Apply:
 *   $env:VISION_SYNC_TARGET='neon'
 *   $env:MATCH_VISION_APPLY='1'
 *   npm run backfill:missed-vision-pids
 */
import { existsSync, readFileSync } from 'node:fs'
import { execute, query } from '../lib/db/postgres'
import {
  ensureVisionAddressesTable,
  getVisionAddress,
} from '../lib/db/vision-addresses-repo'
import { normalizePropertyAddress, normalizeStreetLine } from '../lib/property-address'
import { addressMatchKey, addressMatchKeyLoose } from '../lib/vision-listing-match'
import {
  ingestVisionParcelPid,
  listVisionParcelsOnStreet,
  type VisionSyncSessionTotals,
} from '../lib/vision-gis-sync'
import { VISION_GIS_TOWNS } from '../lib/vision-gis-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const PROD_POOLER_HOST = 'ep-sweet-hat-athkenj5-pooler.c-9.us-east-1.aws.neon.tech'
const DELAY_MS = 500

type MissedListing = {
  id: string
  mls_id: string | null
  address_street: string
  postal_code: string | null
  property_type: string | null
  style: string | null
}

function parseDbUrl(raw: string): { host: string; db: string; local: boolean } | null {
  try {
    const u = new URL(raw)
    const host = (u.hostname || '').toLowerCase()
    if (!host) return null
    const db = u.pathname.replace(/^\//, '').split('?')[0] || '?'
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    return { host, db, local }
  } catch {
    return null
  }
}

function neonUrlsFromEnvLocal(): string[] {
  if (!existsSync('.env.local')) return []
  const found: string[] = []
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const s = line.trim().replace(/^#\s*/, '')
    const m =
      /^(?:DATABASE_URL|NETLIFY_DATABASE_URL|DATABASE_URL_UNPOOLED|NETLIFY_DATABASE_URL_UNPOOLED)\s*=\s*(.*)$/.exec(
        s,
      )
    if (!m) continue
    const value = m[1].trim().replace(/^['"]|['"]$/g, '')
    if (!value.toLowerCase().includes('neon.tech')) continue
    found.push(value)
  }
  return found
}

function wantNeonTarget(): boolean {
  const t = process.env.VISION_SYNC_TARGET?.trim().toLowerCase()
  return t === 'neon' || t === 'prod'
}

function resolveConnectionString(): { url: string; source: string } {
  if (wantNeonTarget()) {
    const neonUrls = neonUrlsFromEnvLocal()
    const pooler = neonUrls.find((u) => parseDbUrl(u)?.host === PROD_POOLER_HOST)
    const anyProd = neonUrls.find((u) =>
      parseDbUrl(u)?.host.includes('ep-sweet-hat-athkenj5'),
    )
    const url = pooler ?? anyProd
    if (!url) {
      throw new Error(
        `VISION_SYNC_TARGET=neon but .env.local has no neon.tech URL for ${PROD_POOLER_HOST}`,
      )
    }
    return { url, source: 'env.local neon (commented or active)' }
  }
  const raw =
    process.env.DATABASE_URL?.trim() ||
    process.env.NETLIFY_DATABASE_URL?.trim() ||
    ''
  if (!raw) throw new Error('DATABASE_URL is not set')
  return { url: raw, source: 'DATABASE_URL' }
}

function splitHouseStreet(street: string): { no: string; name: string } | null {
  const norm = normalizeStreetLine(street)
  const m = norm.match(/^(\d+[a-z]?)\s+(.+)$/i)
  if (!m) return null
  return { no: m[1]!.toUpperCase(), name: m[2]!.toUpperCase() }
}

function labelMatchesHouse(label: string, houseNo: string): boolean {
  const t = label.trim().toUpperCase()
  const n = houseNo.toUpperCase()
  return new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|-|#|$)`).test(
    t,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const { url, source } = resolveConnectionString()
  process.env.DATABASE_URL = url
  const parsed = parseDbUrl(url)
  if (!parsed) throw new Error('DATABASE_URL is not a parseable postgres URL')

  const wantNeon = wantNeonTarget()
  const apply = process.env.MATCH_VISION_APPLY === '1'
  const town = process.env.VISION_SYNC_TOWN?.trim() || VISION_GIS_TOWNS[0]?.town || 'Westport'

  console.info(
    `[backfill-missed-vision] database host=${parsed.host} db=${parsed.db} source=${source}` +
      (parsed.local ? ' (LOCAL — not Neon prod)' : ''),
  )
  if (wantNeon && parsed.host !== PROD_POOLER_HOST) {
    throw new Error(`Refusing to run: expected ${PROD_POOLER_HOST}, got ${parsed.host}`)
  }
  if (parsed.local && wantNeon) {
    throw new Error('Refusing to run: VISION_SYNC_TARGET=neon resolved to localhost')
  }

  await ensureVisionAddressesTable()

  const listings = await query<MissedListing>(
    `SELECT id, mls_id, address_street, postal_code, property_type, style
       FROM listings
      WHERE vision_pid IS NULL
        AND lower(town) = lower($1)
        AND address_street IS NOT NULL
        AND trim(address_street) <> ''
      ORDER BY address_street`,
    [town],
  )

  const session: VisionSyncSessionTotals = {
    checked: 0,
    newParcels: 0,
    changed: 0,
    unchanged: 0,
  }
  const totals = {
    listings: listings.length,
    stamped: 0,
    ingested: 0,
    alreadyInGis: 0,
    ambiguous: 0,
    notOnStreet: 0,
    noStreetParse: 0,
  }

  console.info(
    `[backfill-missed-vision] town=${town} listings=${listings.length}` +
      ` mode=${apply ? 'APPLY' : 'dry-run'} · listing-driven, not a full street walk`,
  )

  const streetCache = new Map<
    string,
    { visionPid: string; addressLabel: string }[]
  >()

  for (let i = 0; i < listings.length; i += 1) {
    const row = listings[i]!
    const parsedStreet = splitHouseStreet(row.address_street)
    const prefix = `[${i + 1}/${listings.length}] ${row.address_street}`

    if (!parsedStreet) {
      totals.noStreetParse += 1
      console.info(`${prefix} · skip (no house + street)`)
      continue
    }

    const matchKey = addressMatchKey(
      normalizePropertyAddress(town, row.address_street, row.postal_code),
    )
    const looseKey = addressMatchKeyLoose(
      normalizePropertyAddress(town, row.address_street, row.postal_code),
    )

    const existing = await query<{ vision_pid: string; address_norm: string | null }>(
      `SELECT vision_pid, address_norm FROM vision_addresses
        WHERE town = $1
          AND (
            regexp_replace(coalesce(address_norm, ''), '\\|\\d{5}$', '') = $2
            OR (street_no = $3 AND lower(coalesce(street_name, '')) = lower($4))
            OR street_no = $3
          )`,
      [town, matchKey, parsedStreet.no, parsedStreet.name],
    )
    const exactHits = existing.filter((r) => {
      if (!r.address_norm) return false
      const keys = {
        exact: addressMatchKey(r.address_norm),
        loose: addressMatchKeyLoose(r.address_norm),
      }
      return keys.exact === matchKey || keys.loose === looseKey
    })
    const existingForMatch = exactHits.length > 0 ? exactHits : existing.filter((r) => {
      if (!r.address_norm) return false
      return addressMatchKeyLoose(r.address_norm) === looseKey
    })
    const existingPids = [...new Set(existingForMatch.map((r) => r.vision_pid))]

    let pids = existingPids
    if (pids.length === 1) {
      totals.alreadyInGis += 1
    } else if (pids.length === 0) {
      let links = streetCache.get(parsedStreet.name)
      if (!links) {
        links = await listVisionParcelsOnStreet(town, parsedStreet.name)
        streetCache.set(parsedStreet.name, links)
        await sleep(DELAY_MS)
      }
      const hits = links.filter((l) =>
        labelMatchesHouse(l.addressLabel, parsedStreet.no),
      )
      pids = [...new Set(hits.map((h) => h.visionPid))]
      if (pids.length === 0) {
        totals.notOnStreet += 1
        console.info(
          `${prefix} · not on VGSI ${parsedStreet.name} (${links.length} parcels on street)`,
        )
        console.info(
          `[backfill-missed-vision] running ${i + 1}/${listings.length}` +
            ` stamped=${totals.stamped} ingested=${totals.ingested}` +
            ` missed=${totals.notOnStreet + totals.ambiguous + totals.noStreetParse}`,
        )
        continue
      }
      if (apply) {
        for (const pid of pids) {
          const before = await getVisionAddress(town, pid)
          await ingestVisionParcelPid(town, pid, {
            delayMs: DELAY_MS,
            session,
          })
          if (!before) totals.ingested += 1
        }
      } else {
        totals.ingested += pids.filter(Boolean).length
        session.checked += pids.length
      }
    }

    if (pids.length !== 1) {
      totals.ambiguous += 1
      console.info(`${prefix} · ambiguous ${pids.length} PIDs [${pids.join(', ')}]`)
      console.info(
        `[backfill-missed-vision] running ${i + 1}/${listings.length}` +
          ` stamped=${totals.stamped} ingested=${totals.ingested}` +
          ` missed=${totals.notOnStreet + totals.ambiguous + totals.noStreetParse}`,
      )
      continue
    }

    const pid = pids[0]!
    if (apply) {
      await execute(
        `UPDATE listings
            SET vision_pid = $1
          WHERE id = $2
            AND (vision_pid IS NULL OR vision_pid = '')`,
        [pid, row.id],
      )
    }
    totals.stamped += 1
    console.info(
      `${prefix} · ${apply ? 'stamped' : 'would stamp'} pid=${pid}` +
        (row.mls_id ? ` mls=${row.mls_id}` : ''),
    )
    console.info(
      `[backfill-missed-vision] running ${i + 1}/${listings.length}` +
        ` stamped=${totals.stamped} ingested=${totals.ingested}` +
        ` gis-checked=${session.checked}`,
    )
  }

  console.info(
    JSON.stringify(
      {
        town,
        dryRun: !apply,
        ...totals,
        gisChecked: session.checked,
        gisNew: session.newParcels,
      },
      null,
      2,
    ),
  )
  if (!apply) {
    console.info(
      '[backfill-missed-vision] dry-run only. Set MATCH_VISION_APPLY=1 to write vision_pid / ingest parcels.',
    )
  }
}

main().catch((err) => {
  console.error('[backfill-missed-vision] fatal', err)
  process.exit(1)
})
