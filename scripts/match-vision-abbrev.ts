/**
 * Report (and optionally stamp) Westport listings whose Vision PID is null
 * because MLS abbreviated a *name* token that VGSI spelled out.
 *
 * Example: MLS `1 BLIND BRK RD S` ↔ VGSI `1 Blind Brook Rd S` (pid 170432687,
 * MBLU `B09/ / 084/000 /`). Exact address_norm cannot hit this; token
 * expansion (brk↔brook) can, still gated on exactly one Vision PID.
 *
 * This is not unconstrained fuzzy (no house-number-only, no trigram).
 * MBLU is shown for verification — MLS usually has no Westport MBLU, so it
 * is not the join key.
 *
 * Dry-run (default):
 *   $env:VISION_SYNC_TARGET='neon'
 *   npm run match:vision-abbrev
 *
 * Apply unique abbrev hits only:
 *   $env:VISION_SYNC_TARGET='neon'
 *   $env:MATCH_VISION_APPLY='1'
 *   npm run match:vision-abbrev
 */
import { existsSync, readFileSync } from 'node:fs'
import { execute, query } from '../lib/db/postgres'
import { normalizePropertyAddress, normalizeStreetLine } from '../lib/property-address'
import {
  addressMatchKey,
  addressMatchKeyLoose,
  compactMblu,
} from '../lib/vision-listing-match'
import { VISION_GIS_TOWNS } from '../lib/vision-gis-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const PROD_POOLER_HOST = 'ep-sweet-hat-athkenj5-pooler.c-9.us-east-1.aws.neon.tech'
const NEAR_JACCARD = 0.6

type MissedListing = {
  id: string
  mls_id: string | null
  address_street: string
  postal_code: string | null
  property_type: string | null
  style: string | null
  parcel_number: string | null
}

type VisionRow = {
  vision_pid: string
  address_full: string | null
  address_norm: string | null
  street_no: string | null
  street_name: string | null
  mblu: string | null
}

type HitReason = 'abbrev' | 'suffix' | 'near' | 'ambiguous' | 'missing-from-gis'

type DiffRow = {
  listingId: string
  mlsId: string | null
  listingStreet: string
  propertyType: string | null
  reason: HitReason
  visionPid: string | null
  visionStreet: string | null
  mblu: string | null
  matchKey: string
  jaccard: number | null
  candidates: number
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
  const sessionUrl = process.env.DATABASE_URL?.trim() || ''
  if (sessionUrl && /…|%e2%80%a6|\.{3}neon\.tech/i.test(sessionUrl)) {
    delete process.env.DATABASE_URL
  }
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

function houseNo(street: string): string | null {
  const m = normalizeStreetLine(street).match(/^(\d+[a-z]?)\b/)
  return m?.[1] ?? null
}

function streetTokenSet(street: string): Set<string> {
  const tokens = normalizeStreetLine(street)
    .split(' ')
    .filter((t) => t.length > 0 && !/^\d+[a-z]?$/.test(t))
  return new Set(tokens)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

async function main() {
  const { url, source } = resolveConnectionString()
  process.env.DATABASE_URL = url
  const parsed = parseDbUrl(url)
  if (!parsed) throw new Error('DATABASE_URL is not a parseable postgres URL')

  const wantNeon = wantNeonTarget()
  const apply = process.env.MATCH_VISION_APPLY === '1'
  const town = process.env.VISION_SYNC_TOWN?.trim() || VISION_GIS_TOWNS[0]?.town || 'Westport'
  const propertyType = process.env.VISION_MATCH_PROPERTY_TYPE?.trim() || null

  console.info(
    `[match-vision-abbrev] database host=${parsed.host} db=${parsed.db} source=${source}` +
      (parsed.local ? ' (LOCAL — not Neon prod)' : ''),
  )
  if (wantNeon && parsed.host !== PROD_POOLER_HOST) {
    throw new Error(`Refusing to run: expected ${PROD_POOLER_HOST}, got ${parsed.host}`)
  }
  if (parsed.local && wantNeon) {
    throw new Error('Refusing to run: VISION_SYNC_TARGET=neon resolved to localhost')
  }

  const listings = await query<MissedListing>(
    `SELECT id, mls_id, address_street, postal_code, property_type, style,
            NULLIF(btrim(raw->>'ParcelNumber'), '') AS parcel_number
       FROM listings
      WHERE vision_pid IS NULL
        AND lower(town) = lower($1)
        AND address_street IS NOT NULL
        AND trim(address_street) <> ''
        AND ($2::text IS NULL OR property_type = $2)
      ORDER BY address_street, property_type, style`,
    [town, propertyType],
  )

  const visionRows = await query<VisionRow>(
    `SELECT vision_pid, address_full, address_norm, street_no, street_name, mblu
       FROM vision_addresses
      WHERE town = $1
        AND address_norm IS NOT NULL`,
    [town],
  )

  const visionByKey = new Map<string, VisionRow[]>()
  const visionByLoose = new Map<string, VisionRow[]>()
  const visionByHouse = new Map<string, VisionRow[]>()
  const visionByMblu = new Map<string, VisionRow[]>()
  for (const v of visionRows) {
    if (!v.address_norm) continue
    const key = addressMatchKey(v.address_norm)
    const atKey = visionByKey.get(key) ?? []
    atKey.push(v)
    visionByKey.set(key, atKey)

    const loose = addressMatchKeyLoose(v.address_norm)
    const atLoose = visionByLoose.get(loose) ?? []
    atLoose.push(v)
    visionByLoose.set(loose, atLoose)

    const no = (v.street_no ?? houseNo(v.address_norm))?.toLowerCase()
    if (no) {
      const atHouse = visionByHouse.get(no) ?? []
      atHouse.push(v)
      visionByHouse.set(no, atHouse)
    }

    const mblu = compactMblu(v.mblu)
    if (mblu) {
      const atMblu = visionByMblu.get(mblu) ?? []
      atMblu.push(v)
      visionByMblu.set(mblu, atMblu)
    }
  }

  const diffs: DiffRow[] = []
  let stamped = 0

  for (const listing of listings) {
    const matchKey = addressMatchKey(
      normalizePropertyAddress(town, listing.address_street, listing.postal_code),
    )
    const exact = visionByKey.get(matchKey) ?? []
    const uniqueExact = [...new Set(exact.map((v) => v.vision_pid))]

    let reason: HitReason
    let hits: VisionRow[] = []
    let score: number | null = null

    const listingMblu = compactMblu(listing.parcel_number)
    const mbluHits = listingMblu ? (visionByMblu.get(listingMblu) ?? []) : []
    const uniqueMblu = [...new Set(mbluHits.map((v) => v.vision_pid))]

    const looseKey = addressMatchKeyLoose(
      normalizePropertyAddress(town, listing.address_street, listing.postal_code),
    )
    const loose = visionByLoose.get(looseKey) ?? []
    const uniqueLoose = [...new Set(loose.map((v) => v.vision_pid))]

    if (uniqueExact.length === 1) {
      reason = 'abbrev'
      hits = exact.filter((v) => v.vision_pid === uniqueExact[0])
      score = 1
    } else if (uniqueLoose.length === 1) {
      reason = 'suffix'
      hits = loose.filter((v) => v.vision_pid === uniqueLoose[0])
      score = 1
    } else if (uniqueMblu.length === 1) {
      reason = 'abbrev'
      hits = mbluHits.filter((v) => v.vision_pid === uniqueMblu[0])
      score = 1
    } else if (uniqueExact.length > 1 || uniqueLoose.length > 1 || uniqueMblu.length > 1) {
      reason = 'ambiguous'
      hits = uniqueExact.length > 1 ? exact : uniqueLoose.length > 1 ? loose : mbluHits
    } else {
      const no = houseNo(listing.address_street)
      const sameHouse = no ? (visionByHouse.get(no) ?? []) : []
      const listingTokens = streetTokenSet(listing.address_street)
      const scored = sameHouse
        .map((v) => ({
          v,
          j: jaccard(
            listingTokens,
            streetTokenSet(v.street_name ?? v.address_full ?? v.address_norm ?? ''),
          ),
        }))
        .filter((row) => row.j >= NEAR_JACCARD)
        .sort((a, b) => b.j - a.j)
      const uniqueNear = [...new Set(scored.map((row) => row.v.vision_pid))]
      if (uniqueNear.length === 1) {
        reason = 'near'
        hits = scored.filter((row) => row.v.vision_pid === uniqueNear[0]).map((row) => row.v)
        score = scored[0]?.j ?? null
      } else if (sameHouse.length === 0) {
        reason = 'missing-from-gis'
      } else {
        reason = uniqueNear.length > 1 ? 'ambiguous' : 'missing-from-gis'
        hits = scored.map((row) => row.v)
        score = scored[0]?.j ?? null
      }
    }

    const primary = hits[0] ?? null
    diffs.push({
      listingId: listing.id,
      mlsId: listing.mls_id,
      listingStreet: listing.address_street,
      propertyType: listing.property_type,
      reason,
      visionPid: primary?.vision_pid ?? null,
      visionStreet: primary?.address_full ?? primary?.address_norm ?? null,
      mblu: primary?.mblu ?? null,
      matchKey,
      jaccard: score,
      candidates: new Set(hits.map((h) => h.vision_pid)).size,
    })

    if (apply && (reason === 'abbrev' || reason === 'suffix') && primary) {
      stamped += await execute(
        `UPDATE listings
            SET vision_pid = $1
          WHERE id = $2
            AND (vision_pid IS NULL OR vision_pid = '')`,
        [primary.vision_pid, listing.id],
      )
    }
  }

  const counts = {
    listings: listings.length,
    visionRows: visionRows.length,
    abbrev: diffs.filter((d) => d.reason === 'abbrev').length,
    suffix: diffs.filter((d) => d.reason === 'suffix').length,
    near: diffs.filter((d) => d.reason === 'near').length,
    ambiguous: diffs.filter((d) => d.reason === 'ambiguous').length,
    missingFromGis: diffs.filter((d) => d.reason === 'missing-from-gis').length,
    stamped: apply ? stamped : 0,
  }

  for (const d of diffs) {
    const vis = d.visionStreet ?? '—'
    const pid = d.visionPid ?? '—'
    const mblu = d.mblu ?? '—'
    const jac = d.jaccard != null ? d.jaccard.toFixed(2) : '—'
    console.info(
      `${d.listingStreet}  →  ${vis}  pid=${pid}  mblu=${mblu}  ${d.reason}  j=${jac}` +
        (d.mlsId ? `  mls=${d.mlsId}` : ''),
    )
  }

  console.info(JSON.stringify({ town, dryRun: !apply, propertyType, ...counts }, null, 2))
  if (!apply) {
    console.info(
      '[match-vision-abbrev] dry-run only. Set MATCH_VISION_APPLY=1 to stamp unique abbrev hits (not near/ambiguous).',
    )
  }
}

main().catch((err) => {
  console.error('[match-vision-abbrev] fatal', err)
  process.exit(1)
})
