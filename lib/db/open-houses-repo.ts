import 'server-only'

import { execute, query, withTransaction } from '@/lib/db/postgres'
import {
  openHouseDateWindow,
  type OpenHouseEvent,
} from '@/lib/open-houses'

/**
 * Same DDL as db/migrations/0023_open_houses.sql. Netlify does not run
 * migrations on deploy, so the table has to be able to appear from the app side
 * too — the same arrangement `sync_queue` uses.
 */
let ensured: Promise<void> | null = null

export async function ensureOpenHousesTable(): Promise<void> {
  if (ensured) return ensured
  ensured = (async () => {
    await execute(`
      CREATE TABLE IF NOT EXISTS open_houses (
        id             text PRIMARY KEY,
        listing_key    text,
        listing_id     text,
        oh_date        date        NOT NULL,
        start_datetime text,
        end_datetime   text,
        oh_type        text,
        comment        text,
        synced_at      timestamptz NOT NULL DEFAULT now()
      )
    `)
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_open_houses_date ON open_houses (oh_date)`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_open_houses_listing_id
         ON open_houses (listing_id) WHERE listing_id IS NOT NULL`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_open_houses_listing_key
         ON open_houses (listing_key) WHERE listing_key IS NOT NULL`,
    )
  })().catch((err) => {
    ensured = null
    throw err
  })
  return ensured
}

type OpenHouseRow = {
  id: string
  listing_key: string | null
  listing_id: string | null
  oh_date: Date | string
  start_datetime: string | null
  end_datetime: string | null
  oh_type: string | null
  comment: string | null
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function mapRow(row: OpenHouseRow): OpenHouseEvent {
  return {
    id: row.id,
    listingKey: row.listing_key ?? '',
    listingId: row.listing_id ?? '',
    date: isoDate(row.oh_date),
    startDateTime: row.start_datetime,
    endDateTime: row.end_datetime,
    type: row.oh_type ?? '',
    comment: row.comment,
  }
}

/**
 * Replace one date window with the events RETS just returned.
 *
 * Whole-window replace rather than upsert-only, because a cancelled open house
 * is an absence — there is no delete event to react to. Done in a transaction
 * so the page never reads a half-replaced window, and only ever called with a
 * pull the caller has already confirmed succeeded.
 */
export async function replaceOpenHouseWindow(
  window: { start: string; end: string },
  events: readonly OpenHouseEvent[],
): Promise<{ written: number; removed: number }> {
  await ensureOpenHousesTable()

  return withTransaction(async (client) => {
    const deleted = await client.query(
      `DELETE FROM open_houses WHERE oh_date BETWEEN $1::date AND $2::date`,
      [window.start, window.end],
    )

    let written = 0
    for (const event of events) {
      await client.query(
        `INSERT INTO open_houses
           (id, listing_key, listing_id, oh_date, start_datetime, end_datetime,
            oh_type, comment, synced_at)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, now())
         ON CONFLICT (id) DO UPDATE SET
           listing_key    = EXCLUDED.listing_key,
           listing_id     = EXCLUDED.listing_id,
           oh_date        = EXCLUDED.oh_date,
           start_datetime = EXCLUDED.start_datetime,
           end_datetime   = EXCLUDED.end_datetime,
           oh_type        = EXCLUDED.oh_type,
           comment        = EXCLUDED.comment,
           synced_at      = now()`,
        [
          event.id,
          event.listingKey || null,
          event.listingId || null,
          event.date,
          event.startDateTime,
          event.endDateTime,
          event.type || null,
          event.comment,
        ],
      )
      written += 1
    }

    return { written, removed: deleted.rowCount ?? 0 }
  })
}

/** Drop events that have fallen out of the rolling window. */
export async function pruneOpenHousesBefore(isoDay: string): Promise<number> {
  await ensureOpenHousesTable()
  return execute(`DELETE FROM open_houses WHERE oh_date < $1::date`, [isoDay])
}

export async function readOpenHousesInWindow(
  window = openHouseDateWindow(),
): Promise<OpenHouseEvent[]> {
  await ensureOpenHousesTable()
  const rows = await query<OpenHouseRow>(
    `SELECT id, listing_key, listing_id, oh_date, start_datetime, end_datetime,
            oh_type, comment
       FROM open_houses
      WHERE oh_date BETWEEN $1::date AND $2::date
      ORDER BY oh_date ASC, start_datetime ASC NULLS LAST`,
    [window.start, window.end],
  )
  return rows.map(mapRow)
}

export async function readOpenHouseStats(): Promise<{
  total: number
  lastSyncedAt: string | null
}> {
  try {
    await ensureOpenHousesTable()
    const rows = await query<{ total: string; last_synced: Date | string | null }>(
      `SELECT count(*)::text AS total, max(synced_at) AS last_synced FROM open_houses`,
    )
    const row = rows[0]
    const last = row?.last_synced ?? null
    return {
      total: Number(row?.total ?? 0),
      lastSyncedAt:
        last instanceof Date ? last.toISOString() : last ? String(last) : null,
    }
  } catch {
    return { total: 0, lastSyncedAt: null }
  }
}
