import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { zipsForAllTowns } from '@/lib/tmre-towns'
import {
  fetchTigerwebZctaRings,
  TIGERWEB_ZCTA_SOURCE,
  type ZipBoundaryRing,
} from '@/lib/zip-boundary-tiger'

export const ZIP_BOUNDARIES_LAST_SYNC_KEY = 'last_zip_boundaries_sync'
export const ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY = 'last_zip_boundaries_sync_started'

/** Refresh when older than ~28 days (monthly cron + small overlap). */
export const ZIP_BOUNDARIES_TTL_MS = 28 * 24 * 60 * 60 * 1000

let ensured = false

export async function ensureZipBoundaryTable(): Promise<void> {
  if (ensured) return
  await execute(`
    CREATE TABLE IF NOT EXISTS zip_boundaries (
      zip         text PRIMARY KEY,
      rings       jsonb NOT NULL,
      source      text NOT NULL DEFAULT 'tigerweb',
      fetched_at  timestamptz NOT NULL DEFAULT now()
    )
  `)
  ensured = true
}

export type ZipBoundaryRow = {
  zip: string
  rings: ZipBoundaryRing[]
  source: string
  fetchedAt: string
}

export async function readZipBoundary(zip: string): Promise<ZipBoundaryRow | null> {
  await ensureZipBoundaryTable()
  const row = await queryOne<{
    zip: string
    rings: ZipBoundaryRing[] | string
    source: string
    fetched_at: string
  }>('SELECT zip, rings, source, fetched_at FROM zip_boundaries WHERE zip = $1', [zip])
  if (!row) return null
  const rings =
    typeof row.rings === 'string'
      ? (JSON.parse(row.rings) as ZipBoundaryRing[])
      : row.rings
  return {
    zip: row.zip,
    rings,
    source: row.source,
    fetchedAt: row.fetched_at,
  }
}

export async function readZipBoundaries(
  zips: readonly string[],
): Promise<Map<string, ZipBoundaryRing[]>> {
  await ensureZipBoundaryTable()
  const unique = [...new Set(zips.map((z) => z.trim()).filter(Boolean))]
  const out = new Map<string, ZipBoundaryRing[]>()
  if (unique.length === 0) return out

  const rows = await query<{
    zip: string
    rings: ZipBoundaryRing[] | string
  }>(
    `SELECT zip, rings FROM zip_boundaries WHERE zip = ANY($1::text[])`,
    [unique],
  )
  for (const row of rows) {
    const rings =
      typeof row.rings === 'string'
        ? (JSON.parse(row.rings) as ZipBoundaryRing[])
        : row.rings
    if (Array.isArray(rings) && rings.length > 0) out.set(row.zip, rings)
  }
  return out
}

export async function writeZipBoundary(
  zip: string,
  rings: ZipBoundaryRing[],
  source = TIGERWEB_ZCTA_SOURCE,
): Promise<void> {
  await ensureZipBoundaryTable()
  await execute(
    `INSERT INTO zip_boundaries (zip, rings, source, fetched_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (zip) DO UPDATE SET
       rings = EXCLUDED.rings,
       source = EXCLUDED.source,
       fetched_at = EXCLUDED.fetched_at`,
    [zip, JSON.stringify(rings), source],
  )
}

/**
 * Resolve rings for zips: Postgres first, then TIGERweb + upsert missing.
 * Prefer this over hitting Census on every hover.
 */
export async function getZipBoundaryRings(
  zips: readonly string[],
  options?: { fetchMissing?: boolean },
): Promise<Map<string, ZipBoundaryRing[]>> {
  const fetchMissing = options?.fetchMissing !== false
  const unique = [...new Set(zips.map((z) => z.trim()).filter(Boolean))]
  const out = await readZipBoundaries(unique)
  if (!fetchMissing) return out

  for (const zip of unique) {
    if (out.has(zip)) continue
    try {
      const rings = await fetchTigerwebZctaRings(zip)
      await writeZipBoundary(zip, rings)
      out.set(zip, rings)
    } catch (err) {
      console.warn(`[zip-boundaries] TIGERweb fetch failed for ${zip}`, err)
    }
  }
  return out
}

export async function syncAllTmreZipBoundaries(): Promise<{
  ok: boolean
  written: number
  failed: string[]
  durationMs: number
}> {
  const t0 = Date.now()
  await setSyncMetaDurable(ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY, new Date().toISOString())
  await ensureZipBoundaryTable()

  const zips = zipsForAllTowns()
  let written = 0
  const failed: string[] = []

  for (const zip of zips) {
    try {
      const rings = await fetchTigerwebZctaRings(zip)
      await writeZipBoundary(zip, rings)
      written += 1
    } catch (err) {
      failed.push(zip)
      console.warn(`[zip-boundaries] sync failed for ${zip}`, err)
    }
  }

  const finishedAt = new Date().toISOString()
  if (written > 0) {
    await setSyncMetaDurable(ZIP_BOUNDARIES_LAST_SYNC_KEY, finishedAt)
  }

  return {
    ok: failed.length === 0,
    written,
    failed,
    durationMs: Date.now() - t0,
  }
}

export async function zipBoundariesInventory(): Promise<{
  storedCount: number
  expectedCount: number
  oldestFetchedAt: string | null
  newestFetchedAt: string | null
  stale: boolean
}> {
  await ensureZipBoundaryTable()
  const expectedCount = zipsForAllTowns().length
  const row = await queryOne<{
    n: string
    oldest: string | null
    newest: string | null
  }>(
    `SELECT count(*)::text AS n,
            min(fetched_at)::text AS oldest,
            max(fetched_at)::text AS newest
     FROM zip_boundaries`,
  )
  const storedCount = Number(row?.n ?? 0)
  const newestMs = row?.newest ? Date.parse(row.newest) : NaN
  const stale =
    storedCount < expectedCount ||
    !Number.isFinite(newestMs) ||
    Date.now() - newestMs >= ZIP_BOUNDARIES_TTL_MS
  return {
    storedCount,
    expectedCount,
    oldestFetchedAt: row?.oldest ?? null,
    newestFetchedAt: row?.newest ?? null,
    stale,
  }
}
