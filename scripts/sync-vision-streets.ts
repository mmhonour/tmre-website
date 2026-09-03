/**
 * CLI: fill missing vision_streets letters only. No parcel walk.
 *
 * Production:
 *   VISION_SYNC_TARGET=neon npm run sync:vision-streets
 *
 * Default DATABASE_URL (often localhost) is used unless VISION_SYNC_TARGET=neon.
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  fillMissingVisionStreetIndex,
} from '../lib/vision-gis-sync'
import {
  VISION_GIS_TOWNS,
  visionGisTownConfig,
} from '../lib/vision-gis-towns'

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
    return { url, source: 'env.local neon' }
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
  if (wantNeonTarget() && parsed.host !== PROD_POOLER_HOST) {
    throw new Error(
      `Refusing to run: expected ${PROD_POOLER_HOST}, got ${parsed.host}`,
    )
  }
  if (parsed.local && wantNeonTarget()) {
    throw new Error('Refusing to run: VISION_SYNC_TARGET=neon resolved to localhost')
  }
  if (parsed.local) {
    console.warn(
      '[sync-vision-streets] WARNING: localhost. Set VISION_SYNC_TARGET=neon to write production.',
    )
  }

  const townName = process.env.VISION_SYNC_TOWN?.trim() || VISION_GIS_TOWNS[0]!.town
  const cfg = visionGisTownConfig(townName)
  if (!cfg) throw new Error(`No VGSI host for town "${townName}"`)

  console.info(
    `[sync-vision-streets] town=${cfg.town} host=${parsed.host} db=${parsed.db} source=${source}`,
  )
  const result = await fillMissingVisionStreetIndex(cfg, 400)
  console.info(
    `[sync-vision-streets] filled ${result.filled.join(',') || '—'} · already ${result.skipped.join(',') || '—'} · failed ${result.failed.join(',') || '—'}`,
  )
  if (result.failed.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[sync-vision-streets] fatal', err)
  process.exit(1)
})
