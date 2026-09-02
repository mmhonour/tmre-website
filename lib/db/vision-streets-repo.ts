import 'server-only'

import { query, withTransaction } from '@/lib/db/postgres'

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
