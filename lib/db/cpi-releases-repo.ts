import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import type { CpiHighlight } from '@/lib/cpi-release-parse'
import type { CpiRelease } from '@/lib/cpi-calendar'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'

let ensured = false

export async function ensureCpiReleasesTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS cpi_releases (
      id              text PRIMARY KEY,
      reference_month text NOT NULL,
      release_date    text NOT NULL,
      release_time_et text NOT NULL DEFAULT '8:30 a.m. ET',
      mom_pct         numeric,
      yoy_pct         numeric,
      core_mom_pct    numeric,
      core_yoy_pct    numeric,
      release_url     text,
      note            text,
      summary         text,
      excerpt         text,
      highlights_json text,
      synced_at       timestamptz NOT NULL DEFAULT now(),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_cpi_releases_release_date
      ON cpi_releases (release_date DESC)
  `)
  ensured = true
}

type CpiReleaseRow = {
  id: string
  reference_month: string
  release_date: string
  release_time_et: string
  mom_pct: string | number | null
  yoy_pct: string | number | null
  core_mom_pct: string | number | null
  core_yoy_pct: string | number | null
  release_url: string | null
  note: string | null
  summary: string | null
  excerpt: string | null
  highlights_json: string | null
  synced_at: Date | string
}

function toNum(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function parseHighlights(raw: string | null): CpiHighlight[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (h): h is CpiHighlight =>
        Boolean(
          h &&
            typeof h === 'object' &&
            typeof (h as CpiHighlight).label === 'string' &&
            ((h as CpiHighlight).direction === 'up' ||
              (h as CpiHighlight).direction === 'down' ||
              (h as CpiHighlight).direction === 'flat'),
        ),
    )
  } catch {
    return []
  }
}

function rowToRelease(row: CpiReleaseRow): CpiRelease {
  return {
    id: row.id,
    referenceMonth: row.reference_month,
    releaseDate: row.release_date,
    releaseTimeEt: row.release_time_et || '8:30 a.m. ET',
    momPct: toNum(row.mom_pct),
    yoyPct: toNum(row.yoy_pct),
    coreMomPct: toNum(row.core_mom_pct),
    coreYoyPct: toNum(row.core_yoy_pct),
    releaseUrl: row.release_url,
    note: row.note ?? undefined,
    summary: row.summary,
    excerpt: row.excerpt,
    highlights: parseHighlights(row.highlights_json),
    syncedAt:
      row.synced_at instanceof Date
        ? row.synced_at.toISOString()
        : String(row.synced_at),
  }
}

export async function listCpiReleasesFromDb(): Promise<CpiRelease[]> {
  await ensureCpiReleasesTable()
  const rows = await query<CpiReleaseRow>(
    `SELECT * FROM cpi_releases ORDER BY release_date DESC`,
  )
  return rows.map(rowToRelease)
}

export async function upsertCpiRelease(release: CpiRelease): Promise<void> {
  await ensureCpiReleasesTable()
  await query(
    `INSERT INTO cpi_releases (
       id, reference_month, release_date, release_time_et,
       mom_pct, yoy_pct, core_mom_pct, core_yoy_pct,
       release_url, note, summary, excerpt, highlights_json,
       synced_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now()
     )
     ON CONFLICT (id) DO UPDATE SET
       reference_month = EXCLUDED.reference_month,
       release_date = EXCLUDED.release_date,
       release_time_et = EXCLUDED.release_time_et,
       mom_pct = EXCLUDED.mom_pct,
       yoy_pct = EXCLUDED.yoy_pct,
       core_mom_pct = EXCLUDED.core_mom_pct,
       core_yoy_pct = EXCLUDED.core_yoy_pct,
       release_url = EXCLUDED.release_url,
       note = EXCLUDED.note,
       summary = EXCLUDED.summary,
       excerpt = EXCLUDED.excerpt,
       highlights_json = EXCLUDED.highlights_json,
       synced_at = now(),
       updated_at = now()`,
    [
      release.id,
      release.referenceMonth,
      release.releaseDate,
      release.releaseTimeEt,
      release.momPct,
      release.yoyPct,
      release.coreMomPct,
      release.coreYoyPct,
      release.releaseUrl,
      release.note ?? null,
      release.summary ?? null,
      release.excerpt ?? null,
      JSON.stringify(release.highlights ?? []),
    ],
  )
}

export async function readCpiSyncMeta(): Promise<{
  lastSyncedAt: string | null
  lastResult: string | null
}> {
  try {
    const [at, result] = await Promise.all([
      getSyncMetaFresh('cpi_last_synced_at'),
      getSyncMetaFresh('cpi_last_sync_result'),
    ])
    return {
      lastSyncedAt: at ?? null,
      lastResult: result ?? null,
    }
  } catch {
    return { lastSyncedAt: null, lastResult: null }
  }
}

export async function getCpiReleaseByIdFromDb(
  id: string,
): Promise<CpiRelease | null> {
  await ensureCpiReleasesTable()
  const row = await queryOne<CpiReleaseRow>(
    `SELECT * FROM cpi_releases WHERE id = $1`,
    [id],
  )
  return row ? rowToRelease(row) : null
}
