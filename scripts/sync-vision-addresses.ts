/**
 * CLI: chunked Vision GIS crawl → vision_addresses.
 *
 * Writes wherever DATABASE_URL points. This machine’s .env.local is localhost;
 * production is the commented neon.tech URL in that file.
 *
 * Loop 1k-parcel chunks into prod until the town crawl finishes:
 *   Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
 *   $env:VISION_SYNC_TARGET='neon'
 *   $env:VISION_SYNC_TOWN='Westport'
 *   $env:VISION_SYNC_MAX_PARCELS='1000'
 *   npm run sync:vision-addresses
 *
 * Single chunk: $env:VISION_SYNC_ONCE='1'
 * Per-parcel lines log as the crawl runs. scraped_at is always UTC.
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  syncVisionAddresses,
  type VisionSyncSessionTotals,
} from '../lib/vision-gis-sync'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const PROD_POOLER_HOST = 'ep-sweet-hat-athkenj5-pooler.c-9.us-east-1.aws.neon.tech'
const CLI_DEFAULT_MAX_PARCELS = 1000
const CLI_HARD_CAP = 1000
const MAX_CHUNKS = 50
const BETWEEN_CHUNKS_MS = 2000

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

/** Neon URLs from .env.local, including commented lines (active localhost is ignored). */
function neonUrlsFromEnvLocal(): string[] {
  if (!existsSync('.env.local')) return []
  const found: string[] = []
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const s = line.trim().replace(/^#\s*/, '')
    const m = /^(?:DATABASE_URL|NETLIFY_DATABASE_URL|DATABASE_URL_UNPOOLED|NETLIFY_DATABASE_URL_UNPOOLED)\s*=\s*(.*)$/.exec(
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
      '[sync-vision-addresses] DATABASE_URL is a placeholder (ellipsis …neon.tech), not a real host. Ignoring it.',
    )
    delete process.env.DATABASE_URL
  }

  const wantNeon = wantNeonTarget() || looksLikePlaceholderUrl(sessionUrl)
  if (wantNeon && !wantNeonTarget()) {
    process.env.VISION_SYNC_TARGET = 'neon'
  }

  if (wantNeon) {
    const neonUrls = neonUrlsFromEnvLocal()
    const pooler = neonUrls.find((u) => {
      const parsed = parseDbUrl(u)
      return parsed?.host === PROD_POOLER_HOST
    })
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const { url, source } = resolveConnectionString()
  process.env.DATABASE_URL = url

  const parsed = parseDbUrl(url)
  if (!parsed) throw new Error('DATABASE_URL is not a parseable postgres URL')

  const wantNeon =
    process.env.VISION_SYNC_TARGET?.trim().toLowerCase() === 'neon' ||
    process.env.VISION_SYNC_TARGET?.trim().toLowerCase() === 'prod'

  console.info(
    `[sync-vision-addresses] database host=${parsed.host} db=${parsed.db} source=${source}` +
      (parsed.local ? ' (LOCAL — not Neon prod)' : ''),
  )

  if (wantNeon && parsed.host !== PROD_POOLER_HOST) {
    throw new Error(
      `Refusing to run: expected ${PROD_POOLER_HOST}, got ${parsed.host}`,
    )
  }
  if (parsed.local && wantNeon) {
    throw new Error('Refusing to run: VISION_SYNC_TARGET=neon resolved to localhost')
  }
  if (parsed.local) {
    console.warn(
      '[sync-vision-addresses] WARNING: localhost. Set VISION_SYNC_TARGET=neon to write production.',
    )
  }

  const town = process.env.VISION_SYNC_TOWN?.trim() || undefined
  const maxRaw = Number(process.env.VISION_SYNC_MAX_PARCELS ?? '')
  const maxParcels = Number.isFinite(maxRaw) && maxRaw > 0
    ? Math.min(maxRaw, CLI_HARD_CAP)
    : CLI_DEFAULT_MAX_PARCELS
  const once = process.env.VISION_SYNC_ONCE === '1'
  let forceFull = process.env.VISION_SYNC_FORCE_FULL === '1'
  const session: VisionSyncSessionTotals = {
    checked: 0,
    newParcels: 0,
    changed: 0,
    unchanged: 0,
  }

  console.info(
    `[sync-vision-addresses] ${once ? 'single chunk' : `loop until town complete (max ${MAX_CHUNKS} chunks)`}` +
      `${town ? ` town=${town}` : ''} maxParcels=${maxParcels}` +
      `${forceFull ? ' forceFull (first chunk only)' : ''} · scraped_at = UTC`,
  )

  for (let chunk = 1; chunk <= (once ? 1 : MAX_CHUNKS); chunk += 1) {
    console.info(`[sync-vision-addresses] chunk ${chunk}/${once ? 1 : MAX_CHUNKS} starting…`)
    const result = await syncVisionAddresses({
      town,
      maxParcels,
      forceFull,
      sessionTotals: session,
    })
    forceFull = false
    console.info(
      `[sync-vision-addresses] running total checked=${session.checked}` +
        ` new=${session.newParcels} changed=${session.changed}` +
        ` unchanged=${session.unchanged} rows=${result.totalRows}`,
    )
    console.info(JSON.stringify(result, null, 2))
    if (!result.ok) process.exit(1)
    if (result.townComplete) {
      console.info(
        `[sync-vision-addresses] town complete after ${chunk} chunk(s)` +
          ` · checked=${session.checked} new=${session.newParcels} rows=${result.totalRows}`,
      )
      return
    }
    if (result.parcelsFetched === 0) {
      throw new Error(
        `chunk ${chunk} fetched 0 parcels and town is not complete — stopping`,
      )
    }
    if (!once && chunk < MAX_CHUNKS) {
      console.info(
        `[sync-vision-addresses] chunk ${chunk} done · totalRows=${result.totalRows} · next chunk in ${BETWEEN_CHUNKS_MS / 1000}s`,
      )
      await sleep(BETWEEN_CHUNKS_MS)
    }
  }

  if (!once) {
    throw new Error(
      `stopped after ${MAX_CHUNKS} chunks without townComplete — re-run to continue`,
    )
  }
}

main().catch((err) => {
  console.error('[sync-vision-addresses] fatal', err)
  process.exit(1)
})
