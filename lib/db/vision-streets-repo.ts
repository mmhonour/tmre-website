import 'server-only'

import { query, withTransaction } from '@/lib/db/postgres'
import { ensureVisionAddressesTable } from '@/lib/db/vision-addresses-repo'
import {
  countVisionQuitclaims,
  isVisionQuitclaim,
  lastSaleAsOwnership,
  ownerMailingAddressFromFields,
  ownershipFromFieldCardFields,
  visionDeedDisplayRows,
  visionPurchaseDate,
  type VisionDeedDisplayRow,
  type VisionFieldCardField,
  type VisionOwnershipRow,
} from '@/lib/vision-gis-parse'
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
  ownerName: string | null
  ownerMailingAddress: string | null
  /** VGSI most recent deed date (often a quitclaim, not a purchase). */
  lastSaleDate: string | null
  /** Last paid purchase date when Field Card / last sale price shows consideration. */
  purchaseDate: string | null
  /** True when the most recent VGSI deed is a $0 / instrument 29 quitclaim. */
  lastDeedIsQuitclaim: boolean
  quitclaimCount: number
  deedHistory: VisionDeedDisplayRow[]
}

export type VisionStreetPidMissingOwner = {
  town: string
  streetName: string
  visionPid: string
  addressLabel: string
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
  await ensureVisionAddressesTable()
  const rows = await query<{
    town: string
    street_name: string
    vision_pid: string
    address_label: string
    source_url: string
    synced_at: Date | string
    owner_name: string | null
    owner_mailing_address: string | null
    last_sale_date: string | null
    last_sale_price: number | string | null
    field_card: unknown
  }>(
    `SELECT p.town, p.street_name, p.vision_pid, p.address_label, p.source_url,
            p.synced_at, v.owner_name, v.owner_mailing_address, v.last_sale_date,
            v.last_sale_price, v.field_card
       FROM vision_street_parcels p
       LEFT JOIN vision_addresses v
         ON v.town = p.town AND v.vision_pid = p.vision_pid
      WHERE p.town = $1 AND p.street_name = $2`,
    [town, streetName],
  )
  return rows.map((row) => {
    const card =
      row.field_card && typeof row.field_card === 'object'
        ? (row.field_card as {
            fields?: { section?: string; label: string; value: string }[]
            ownership?: VisionOwnershipRow[]
          })
        : null
    const fields: VisionFieldCardField[] = (card?.fields ?? []).map((f) => ({
      section: f.section ?? 'Parcel',
      label: f.label,
      value: f.value,
    }))
    const fromCard = ownerMailingAddressFromFields(fields)
    const ownership =
      card?.ownership && card.ownership.length > 0
        ? card.ownership
        : ownershipFromFieldCardFields(fields)
    const lastSalePrice =
      row.last_sale_price == null || row.last_sale_price === ''
        ? null
        : Number(row.last_sale_price)
    const paidPrice = Number.isFinite(lastSalePrice) ? lastSalePrice : null
    const deeds =
      ownership.length > 0
        ? ownership
        : lastSaleAsOwnership({
            ownerName: row.owner_name,
            lastSalePrice: paidPrice,
            lastSaleDate: row.last_sale_date,
          })
    return {
      town: row.town,
      streetName: row.street_name,
      visionPid: row.vision_pid,
      addressLabel: row.address_label,
      sourceUrl: row.source_url,
      syncedAt:
        row.synced_at instanceof Date
          ? row.synced_at.toISOString()
          : String(row.synced_at),
      ownerName: row.owner_name?.trim() || null,
      ownerMailingAddress:
        row.owner_mailing_address?.trim() || fromCard,
      lastSaleDate: row.last_sale_date?.trim() || null,
      purchaseDate: visionPurchaseDate({
        lastSaleDate: row.last_sale_date,
        lastSalePrice: paidPrice,
        ownership,
      }),
      lastDeedIsQuitclaim: isVisionQuitclaim({
        price: paidPrice ?? ownership[0]?.price,
        instrument: ownership[0]?.instrument,
      }),
      quitclaimCount: countVisionQuitclaims(ownership),
      deedHistory: visionDeedDisplayRows(deeds),
    }
  })
}

/**
 * Street-house PIDs missing owner_name, or missing mailing when the stored
 * Field Card also has no Owner address. Field Card ingest writes both.
 */
export async function listVisionStreetPidsMissingOwner(
  town: string,
  limit: number,
): Promise<VisionStreetPidMissingOwner[]> {
  await ensureVisionStreetsTable()
  await ensureVisionAddressesTable()
  const cap = Math.max(1, Math.min(Math.floor(limit), 1000))
  const rows = await query<{
    town: string
    street_name: string
    vision_pid: string
    address_label: string
  }>(
    `SELECT p.town, p.street_name, p.vision_pid, p.address_label
       FROM vision_street_parcels p
       LEFT JOIN vision_addresses v
         ON v.town = p.town AND v.vision_pid = p.vision_pid
      WHERE p.town = $1
        AND (
          v.vision_pid IS NULL
          OR v.owner_name IS NULL
          OR btrim(v.owner_name) = ''
          OR (
            (v.owner_mailing_address IS NULL OR btrim(v.owner_mailing_address) = '')
            AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements(coalesce(v.field_card->'fields', '[]'::jsonb)) f
               WHERE f->>'label' ~* '^owner address'
                 AND btrim(coalesce(f->>'value', '')) <> ''
            )
          )
        )
      ORDER BY p.street_name ASC, p.address_label ASC
      LIMIT $2`,
    [town, cap],
  )
  return rows.map((row) => ({
    town: row.town,
    streetName: row.street_name,
    visionPid: row.vision_pid,
    addressLabel: row.address_label,
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

/** True when a street-house PID still has no owner_name on vision_addresses. */
export async function visionStreetOwnersNeedCatchUp(): Promise<boolean> {
  await ensureVisionStreetsTable()
  for (const { town } of VISION_GIS_TOWNS) {
    const missing = await listVisionStreetPidsMissingOwner(town, 1)
    if (missing.length > 0) return true
  }
  return false
}

/**
 * Railway / thin-cron catch-up: letters, houses, or street-address owners.
 * Field Cards are not weekly-only once house lists exist.
 */
export async function visionGisNeedsCatchUp(): Promise<boolean> {
  if (await visionStreetIndexNeedsCatchUp()) return true
  return visionStreetOwnersNeedCatchUp()
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
