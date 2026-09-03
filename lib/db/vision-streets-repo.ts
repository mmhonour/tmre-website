import 'server-only'

import { query, withTransaction } from '@/lib/db/postgres'
import {
  VISION_GIS_TOWNS,
  missingVisionStreetLetters,
} from '@/lib/vision-gis-towns'

/**
 * Same DDL as db/migrations/0024_vision_streets.sql. Netlify does not run
 * migrations on deploy, so the table has to be able to appear from the app.
 */
let ensured: Promise<void> | null = null

export async function ensureVisionStreetsTable(): Promise<void> {
  if (ensured) return ensured
  ensured = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS vision_streets (
        town        text        NOT NULL,
        street_name text        NOT NULL,
        letter      text        NOT NULL,
        source_url  text        NOT NULL,
        synced_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (town, street_name)
      )
    `)
    await query(
      `CREATE INDEX IF NOT EXISTS idx_vision_streets_town_letter
         ON vision_streets (town, letter)`,
    )
    await query(`
      CREATE TABLE IF NOT EXISTS vision_street_parcels (
        town          text        NOT NULL,
        street_name   text        NOT NULL,
        vision_pid    text        NOT NULL,
        address_label text        NOT NULL,
        source_url    text        NOT NULL,
        synced_at     timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (town, street_name, vision_pid)
      )
    `)
    await query(
      `CREATE INDEX IF NOT EXISTS idx_vision_street_parcels_town_street
         ON vision_street_parcels (town, street_name)`,
    )
    await query(
      `ALTER TABLE vision_streets
         ADD COLUMN IF NOT EXISTS parcels_synced_at timestamptz`,
    )
  })().catch((err) => {
    ensured = null
    throw err
  })
  return ensured
}

export type VisionStreet = {
  town: string
  streetName: string
  letter: string
  sourceUrl: string
  syncedAt: string
}

/**
 * Replace one VGSI letter bucket with the names that letter page just returned.
 *
 * Letter-scoped, not town-scoped: a cancelled street on C disappears the next
 * time C is fetched, and a fault on C cannot empty A–B. Only call this after
 * the HTML parse succeeded.
 */
export async function replaceVisionStreetsForLetter(
  town: string,
  letter: string,
  streetNames: readonly string[],
  sourceUrl: string,
): Promise<{ written: number; removed: number }> {
  await ensureVisionStreetsTable()
  const names = [
    ...new Set(
      streetNames.map((n) => n.trim()).filter((n) => n.length > 0),
    ),
  ]

  return withTransaction(async (client) => {
    const deleted = await client.query(
      `DELETE FROM vision_streets WHERE town = $1 AND letter = $2`,
      [town, letter],
    )
    let written = 0
    for (const streetName of names) {
      await client.query(
        `INSERT INTO vision_streets (town, street_name, letter, source_url, synced_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (town, street_name) DO UPDATE SET
           letter     = EXCLUDED.letter,
           source_url = EXCLUDED.source_url,
           synced_at  = now()`,
        [town, streetName, letter, sourceUrl],
      )
      written += 1
    }
    return { written, removed: deleted.rowCount ?? 0 }
  })
}

export async function listVisionStreets(town: string): Promise<VisionStreet[]> {
  await ensureVisionStreetsTable()
  const rows = await query<{
    town: string
    street_name: string
    letter: string
    source_url: string
    synced_at: Date | string
  }>(
    `SELECT town, street_name, letter, source_url, synced_at
       FROM vision_streets
      WHERE town = $1
      ORDER BY street_name ASC`,
    [town],
  )
  return rows.map((row) => ({
    town: row.town,
    streetName: row.street_name,
    letter: row.letter,
    sourceUrl: row.source_url,
    syncedAt:
      row.synced_at instanceof Date
        ? row.synced_at.toISOString()
        : String(row.synced_at),
  }))
}

export async function listVisionStreetTowns(): Promise<string[]> {
  await ensureVisionStreetsTable()
  const rows = await query<{ town: string }>(
    `SELECT DISTINCT town FROM vision_streets ORDER BY town ASC`,
  )
  return rows.map((row) => row.town)
}

export async function listVisionStreetLetters(town: string): Promise<string[]> {
  await ensureVisionStreetsTable()
  const rows = await query<{ letter: string }>(
    `SELECT DISTINCT letter FROM vision_streets WHERE town = $1 ORDER BY letter ASC`,
    [town],
  )
  return rows.map((row) => row.letter.trim().toUpperCase()).filter(Boolean)
}

export async function countVisionStreets(town?: string): Promise<number> {
  await ensureVisionStreetsTable()
  const rows = town
    ? await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM vision_streets WHERE town = $1`,
        [town],
      )
    : await query<{ n: string }>(`SELECT count(*)::text AS n FROM vision_streets`)
  return Number(rows[0]?.n ?? 0)
}

export type VisionStreetParcel = {
  town: string
  streetName: string
  visionPid: string
  addressLabel: string
  sourceUrl: string
  syncedAt: string
}

/**
 * Replace one street’s house-number list with the Names page we just parsed.
 * Street-scoped: a fault on Locust Ln cannot empty Main St.
 */
export async function replaceVisionStreetParcels(
  town: string,
  streetName: string,
  parcels: readonly { visionPid: string; addressLabel: string }[],
  sourceUrl: string,
): Promise<{ written: number; removed: number }> {
  await ensureVisionStreetsTable()
  const seen = new Set<string>()
  const rows: { visionPid: string; addressLabel: string }[] = []
  for (const parcel of parcels) {
    const visionPid = parcel.visionPid.trim()
    const addressLabel = parcel.addressLabel.trim()
    if (!visionPid || !addressLabel || seen.has(visionPid)) continue
    seen.add(visionPid)
    rows.push({ visionPid, addressLabel })
  }

  return withTransaction(async (client) => {
    const deleted = await client.query(
      `DELETE FROM vision_street_parcels WHERE town = $1 AND street_name = $2`,
      [town, streetName],
    )
    let written = 0
    for (const row of rows) {
      await client.query(
        `INSERT INTO vision_street_parcels
           (town, street_name, vision_pid, address_label, source_url, synced_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (town, street_name, vision_pid) DO UPDATE SET
           address_label = EXCLUDED.address_label,
           source_url    = EXCLUDED.source_url,
           synced_at     = now()`,
        [town, streetName, row.visionPid, row.addressLabel, sourceUrl],
      )
      written += 1
    }
    await client.query(
      `UPDATE vision_streets
          SET parcels_synced_at = now()
        WHERE town = $1 AND street_name = $2`,
      [town, streetName],
    )
    return { written, removed: deleted.rowCount ?? 0 }
  })
}

export async function listVisionStreetParcels(
  town: string,
  streetName: string,
): Promise<VisionStreetParcel[]> {
  await ensureVisionStreetsTable()
  const rows = await query<{
    town: string
    street_name: string
    vision_pid: string
    address_label: string
    source_url: string
    synced_at: Date | string
  }>(
    `SELECT town, street_name, vision_pid, address_label, source_url, synced_at
       FROM vision_street_parcels
      WHERE town = $1 AND street_name = $2`,
    [town, streetName],
  )
  return rows.map((row) => ({
    town: row.town,
    streetName: row.street_name,
    visionPid: row.vision_pid,
    addressLabel: row.address_label,
    sourceUrl: row.source_url,
    syncedAt:
      row.synced_at instanceof Date
        ? row.synced_at.toISOString()
        : String(row.synced_at),
  }))
}

export async function countVisionStreetParcelsByStreet(
  town: string,
): Promise<Map<string, number>> {
  await ensureVisionStreetsTable()
  const rows = await query<{ street_name: string; n: string }>(
    `SELECT street_name, count(*)::text AS n
       FROM vision_street_parcels
      WHERE town = $1
      GROUP BY street_name`,
    [town],
  )
  return new Map(rows.map((row) => [row.street_name, Number(row.n)]))
}

export async function listVisionStreetsMissingParcels(
  town: string,
  limit: number,
): Promise<string[]> {
  await ensureVisionStreetsTable()
  const cap = Math.max(1, Math.min(Math.floor(limit), 2000))
  const rows = await query<{ street_name: string }>(
    `SELECT s.street_name
       FROM vision_streets s
      WHERE s.town = $1
        AND s.parcels_synced_at IS NULL
        AND NOT EXISTS (
          SELECT 1
            FROM vision_street_parcels p
           WHERE p.town = s.town
             AND p.street_name = s.street_name
        )
      ORDER BY s.street_name ASC
      LIMIT $2`,
    [town, cap],
  )
  return rows.map((row) => row.street_name)
}

/** True when any configured VGSI town still lacks letters or house lists. */
export async function visionStreetIndexNeedsCatchUp(): Promise<boolean> {
  await ensureVisionStreetsTable()
  for (const { town } of VISION_GIS_TOWNS) {
    const letters = await listVisionStreetLetters(town)
    if (missingVisionStreetLetters(letters).length > 0) return true
    const missingParcels = await listVisionStreetsMissingParcels(town, 1)
    if (missingParcels.length > 0) return true
  }
  return false
}

export async function countVisionStreetParcels(town?: string): Promise<number> {
  await ensureVisionStreetsTable()
  const rows = town
    ? await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM vision_street_parcels WHERE town = $1`,
        [town],
      )
    : await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM vision_street_parcels`,
      )
  return Number(rows[0]?.n ?? 0)
}
