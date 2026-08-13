/**
 * CLI: unique address_norm join listings ↔ vision_addresses.
 *
 * Same join Vision GIS already runs after each crawl. Use this to dry-run
 * (default) on localhost, then apply, then promote with VISION_SYNC_TARGET=neon.
 *
 * Dev dry-run:
 *   npm run match:vision-listings
 *
 * Dev apply:
 *   $env:MATCH_VISION_APPLY='1'
 *   npm run match:vision-listings
 *
 * Prod (Neon) dry-run then apply:
 *   $env:VISION_SYNC_TARGET='neon'
 *   npm run match:vision-listings
 *   $env:MATCH_VISION_APPLY='1'
 *   npm run match:vision-listings
 */
import { existsSync, readFileSync } from 'node:fs'
import { backfillVisionListingLinks } from '../lib/db/vision-addresses-repo'
import { VISION_GIS_TOWNS } from '../lib/vision-gis-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const PROD_POOLER_HOST = 'ep-sweet-hat-athkenj5-pooler.c-9.us-east-1.aws.neon.tech'

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

function looksLikePlaceholderUrl(raw: string): boolean {
  return /…|%e2%80%a6|\.{3}neon\.tech/i.test(raw)
}

function wantNeonTarget(): boolean {
  const t = process.env.VISION_SYNC_TARGET?.trim().toLowerCase()
  return t === 'neon' || t === 'prod'
}

function resolveConnectionString(): { url: string; source: string } {
  const sessionUrl = process.env.DATABASE_URL?.trim() || ''
  if (sessionUrl && looksLikePlaceholderUrl(sessionUrl)) {
    console.warn(
      '[match-vision-listings] DATABASE_URL is a placeholder. Ignoring it.',
    )
    delete process.env.DATABASE_URL
  }

  if (wantNeonTarget()) {
    const neonUrls = neonUrlsFromEnvLocal()
    const pooler = neonUrls.find((u) => parseDbUrl(u)?.host === PROD_POOLER_HOST)
    const anyProd = neonUrls.find((u) => parseDbUrl(u)?.host.includes('ep-sweet-hat-athkenj5'))
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

async function main() {
  const { url, source } = resolveConnectionString()
  process.env.DATABASE_URL = url

  const parsed = parseDbUrl(url)
  if (!parsed) throw new Error('DATABASE_URL is not a parseable postgres URL')

  const wantNeon = wantNeonTarget()
  const apply = process.env.MATCH_VISION_APPLY === '1'
  const town = process.env.VISION_SYNC_TOWN?.trim() || VISION_GIS_TOWNS[0]?.town || 'Westport'

  console.info(
    `[match-vision-listings] database host=${parsed.host} db=${parsed.db} source=${source}` +
      (parsed.local ? ' (LOCAL — not Neon prod)' : ''),
  )
  if (wantNeon && parsed.host !== PROD_POOLER_HOST) {
    throw new Error(`Refusing to run: expected ${PROD_POOLER_HOST}, got ${parsed.host}`)
  }
  if (parsed.local && wantNeon) {
    throw new Error('Refusing to run: VISION_SYNC_TARGET=neon resolved to localhost')
  }
  if (parsed.local) {
    console.warn(
      '[match-vision-listings] WARNING: localhost. Set VISION_SYNC_TARGET=neon to use production.',
    )
  }

  console.info(
    `[match-vision-listings] town=${town} mode=${apply ? 'APPLY' : 'dry-run'} · unique address_norm only`,
  )

  const report = await backfillVisionListingLinks(town, { dryRun: !apply })
  console.info(JSON.stringify(report, null, 2))
  if (!apply) {
    console.info(
      '[match-vision-listings] dry-run only. Set MATCH_VISION_APPLY=1 to write listing_id / vision_pid.',
    )
  }
}

main().catch((err) => {
  console.error('[match-vision-listings] fatal', err)
  process.exit(1)
})
