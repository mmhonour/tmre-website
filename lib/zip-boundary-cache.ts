import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { boundaryZipsForAllTowns, hasZctaBoundary } from '@/lib/tmre-towns'
import {
  fetchTigerwebZctaRings,
  TIGERWEB_ZCTA_SOURCE,
  ZctaGeometryMissingError,
  type ZipBoundaryRing,
} from '@/lib/zip-boundary-tiger'

export const ZIP_BOUNDARIES_LAST_SYNC_KEY = 'last_zip_boundaries_sync'
export const ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY = 'last_zip_boundaries_sync_started'

/** Refresh when older than ~28 days (monthly cron + small overlap). */
export const ZIP_BOUNDARIES_TTL_MS = 28 * 24 * 60 * 60 * 1000

/** Census has no polygon for this zip — never ask again. */
const SOURCE_NO_GEOMETRY = 'no-zcta'
/** Network / service failure — worth one more try, but not on every hover. */
const SOURCE_FETCH_FAILED = 'fetch-failed'
const FETCH_FAILED_RETRY_MS = 6 * 60 * 60 * 1000

/** Per-zip network timeout on the hover path. 20s is a hover-killer. */
const HOVER_FETCH_TIMEOUT_MS = 6_000
/** Whole-request budget for filling misses before answering a hover. */
const HOVER_FETCH_BUDGET_MS = 2_500
const FETCH_CONCURRENCY = 4

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

/**
 * Rows for these zips whether or not they hold geometry, so a known miss is
 * distinguishable from "never looked".
 */
async function readZipBoundaryMarkers(
  zips: readonly string[],
): Promise<Map<string, { hasRings: boolean; source: string; fetchedAtMs: number }>> {
  await ensureZipBoundaryTable()
  const out = new Map<string, { hasRings: boolean; source: string; fetchedAtMs: number }>()
  const unique = [...new Set(zips.map((z) => z.trim()).filter(Boolean))]
  if (unique.length === 0) return out

  const rows = await query<{
    zip: string
    has_rings: boolean
    source: string
    fetched_at: string
  }>(
    `SELECT zip,
            (jsonb_typeof(rings) = 'array' AND jsonb_array_length(rings) > 0) AS has_rings,
            source,
            fetched_at::text AS fetched_at
       FROM zip_boundaries
      WHERE zip = ANY($1::text[])`,
    [unique],
  )
  for (const row of rows) {
    const parsed = Date.parse(row.fetched_at)
    out.set(row.zip, {
      hasRings: row.has_rings === true,
      source: row.source,
      fetchedAtMs: Number.isFinite(parsed) ? parsed : 0,
    })
  }
  return out
}

/** True when a previous lookup already settled this zip. */
function markerBlocksRefetch(
  marker: { hasRings: boolean; source: string; fetchedAtMs: number } | undefined,
): boolean {
  if (!marker) return false
  if (marker.hasRings) return true
  if (marker.source === SOURCE_NO_GEOMETRY) return true
  if (marker.source === SOURCE_FETCH_FAILED) {
    return Date.now() - marker.fetchedAtMs < FETCH_FAILED_RETRY_MS
  }
  return false
}

/** Record a definitive or transient miss so hovers stop paying for it. */
export async function writeZipBoundaryMiss(
  zip: string,
  kind: 'no-geometry' | 'fetch-failed',
): Promise<void> {
  await writeZipBoundary(zip, [], kind === 'no-geometry' ? SOURCE_NO_GEOMETRY : SOURCE_FETCH_FAILED)
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

/** Fetch one zip and record the outcome, including definitive misses. */
async function fillZipBoundary(
  zip: string,
  timeoutMs: number,
): Promise<ZipBoundaryRing[] | null> {
  try {
    const rings = await fetchTigerwebZctaRings(zip, { timeoutMs })
    await writeZipBoundary(zip, rings)
    return rings
  } catch (err) {
    if (err instanceof ZctaGeometryMissingError) {
      await writeZipBoundaryMiss(zip, 'no-geometry')
      console.warn(`[zip-boundaries] no ZCTA geometry for ${zip} — recorded, will not retry`)
      return null
    }
    await writeZipBoundaryMiss(zip, 'fetch-failed').catch(() => {})
    console.warn(`[zip-boundaries] TIGERweb fetch failed for ${zip}`, err)
    return null
  }
}

/**
 * Resolve rings for zips: Postgres first, then TIGERweb for genuine gaps.
 *
 * Never let a map hover wait on Census: zips without a ZCTA are dropped up
 * front, settled misses are not retried, remaining fetches run in parallel,
 * and the whole fill is capped by `budgetMs` — whatever arrived in time is
 * returned rather than holding the response open.
 */
export async function getZipBoundaryRings(
  zips: readonly string[],
  options?: { fetchMissing?: boolean; budgetMs?: number; timeoutMs?: number },
): Promise<{ rings: Map<string, ZipBoundaryRing[]>; missing: string[]; complete: boolean }> {
  const fetchMissing = options?.fetchMissing !== false
  const requested = [...new Set(zips.map((z) => z.trim()).filter(Boolean))]
  const mappable = requested.filter(hasZctaBoundary)
  const rings = await readZipBoundaries(mappable)

  const gaps = mappable.filter((zip) => !rings.has(zip))
  if (!fetchMissing || gaps.length === 0) {
    return { rings, missing: gaps, complete: gaps.length === 0 }
  }

  const markers = await readZipBoundaryMarkers(gaps)
  const fetchable = gaps.filter((zip) => !markerBlocksRefetch(markers.get(zip)))

  if (fetchable.length > 0) {
    const budgetMs = options?.budgetMs ?? HOVER_FETCH_BUDGET_MS
    const timeoutMs = options?.timeoutMs ?? HOVER_FETCH_TIMEOUT_MS
    const deadline = Date.now() + budgetMs
    const queue = [...fetchable]

    const worker = async () => {
      while (queue.length > 0 && Date.now() < deadline) {
        const zip = queue.shift()
        if (!zip) return
        const filled = await fillZipBoundary(zip, timeoutMs)
        if (filled?.length) rings.set(zip, filled)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(FETCH_CONCURRENCY, fetchable.length) }, worker),
    )
  }

  const missing = mappable.filter((zip) => !rings.has(zip))
  return { rings, missing, complete: missing.length === 0 }
}

export async function syncAllTmreZipBoundaries(): Promise<{
  ok: boolean
  written: number
  failed: string[]
  skipped: string[]
  durationMs: number
}> {
  const t0 = Date.now()
  await setSyncMetaDurable(ZIP_BOUNDARIES_LAST_SYNC_STARTED_KEY, new Date().toISOString())
  await ensureZipBoundaryTable()

  // Only zips Census can actually answer for. PO-box zips used to be counted
  // as failures here, which marked every run Failed forever.
  const zips = boundaryZipsForAllTowns()
  let written = 0
  const failed: string[] = []
  const skipped: string[] = []

  for (const zip of zips) {
    try {
      const rings = await fetchTigerwebZctaRings(zip)
      await writeZipBoundary(zip, rings)
      written += 1
    } catch (err) {
      if (err instanceof ZctaGeometryMissingError) {
        await writeZipBoundaryMiss(zip, 'no-geometry').catch(() => {})
        skipped.push(zip)
        console.warn(`[zip-boundaries] no ZCTA geometry for ${zip} — recorded as a permanent miss`)
        continue
      }
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
    skipped,
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
  const expectedCount = boundaryZipsForAllTowns().length
  const row = await queryOne<{
    n: string
    oldest: string | null
    newest: string | null
  }>(
    // Miss markers are stored as empty rings, so they must not count as coverage.
    `SELECT count(*)::text AS n,
            min(fetched_at)::text AS oldest,
            max(fetched_at)::text AS newest
     FROM zip_boundaries
     WHERE jsonb_typeof(rings) = 'array' AND jsonb_array_length(rings) > 0`,
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
