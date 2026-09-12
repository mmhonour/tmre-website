import 'server-only'

import { execute, query, queryOne, withTransaction } from '@/lib/db/postgres'
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
let tablePresent = false

/** Cheap read-path check — do not run CREATE INDEX on `/open-houses`. */
export async function openHousesTableExists(): Promise<boolean> {
  if (tablePresent) return true
  const row = await queryOne<{ reg: string | null }>(
    `SELECT to_regclass('public.open_houses')::text AS reg`,
  )
  tablePresent = Boolean(row?.reg)
  return tablePresent
}

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
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_open_houses_listing_id_date
         ON open_houses (listing_id, oh_date) WHERE listing_id IS NOT NULL`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_open_houses_listing_key_date
         ON open_houses (listing_key, oh_date) WHERE listing_key IS NOT NULL`,
    )
    tablePresent = true
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

/**
 * Insert or refresh events without deleting anything.
 * Used for the lookback pull: MLS dropping an old row must not erase history
 * we already stored.
 */
export async function upsertOpenHouses(
  events: readonly OpenHouseEvent[],
): Promise<number> {
  await ensureOpenHousesTable()
  if (events.length === 0) return 0

  return withTransaction(async (client) => {
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
    return written
  })
}

/**
 * Drop events older than the lookback horizon. Upcoming cancellations are
 * handled by {@link replaceOpenHouseWindow}; history is kept until it ages out.
 */
export async function pruneOpenHousesBefore(isoDay: string): Promise<number> {
  await ensureOpenHousesTable()
  return execute(`DELETE FROM open_houses WHERE oh_date < $1::date`, [isoDay])
}

/** Drop dates after the t+6 inventory horizon (a prior 90-day pull). */
export async function pruneOpenHousesAfter(isoDay: string): Promise<number> {
  await ensureOpenHousesTable()
  return execute(`DELETE FROM open_houses WHERE oh_date > $1::date`, [isoDay])
}

export type OpenHouseListingCounts = {
  past: number
  upcoming: number
}

/**
 * Past / upcoming counts for homes that still have a today-or-later showing.
 * History is documentation (Most / First / relist), not a page of ended series.
 *
 * Two equality aggregates — never `OR` across listing_id / listing_key, which
 * the planner cannot use once `open_houses` holds a year of rows. Prefer the
 * mlsId tally; fall back to listingKey only when that listing has no id rows.
 */
export async function readOpenHouseCountsForListings(
  listings: readonly { mlsId?: string | null; listingKey?: string | null }[],
  today: string,
): Promise<Map<string, OpenHouseListingCounts>> {
  if (!(await openHousesTableExists())) await ensureOpenHousesTable()
  const ids = [
    ...new Set(
      listings.map((row) => row.mlsId?.trim()).filter((id): id is string => Boolean(id)),
    ),
  ]
  const keys = [
    ...new Set(
      listings
        .map((row) => row.listingKey?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const counts = new Map<string, OpenHouseListingCounts>()
  if (ids.length === 0 && keys.length === 0) return counts

  type CountRow = { token: string; past: number; upcoming: number }
  const [byId, byKey] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([] as CountRow[])
      : query<CountRow>(
          `SELECT listing_id AS token,
                  COUNT(*) FILTER (WHERE oh_date < $2::date)::int AS past,
                  COUNT(*) FILTER (WHERE oh_date >= $2::date)::int AS upcoming
             FROM open_houses
            WHERE listing_id = ANY($1::text[])
            GROUP BY listing_id`,
          [ids, today],
        ),
    keys.length === 0
      ? Promise.resolve([] as CountRow[])
      : query<CountRow>(
          `SELECT listing_key AS token,
                  COUNT(*) FILTER (WHERE oh_date < $2::date)::int AS past,
                  COUNT(*) FILTER (WHERE oh_date >= $2::date)::int AS upcoming
             FROM open_houses
            WHERE listing_key = ANY($1::text[])
            GROUP BY listing_key`,
          [keys, today],
        ),
  ])

  const idCounts = new Map(
    byId.map((row) => [
      row.token,
      { past: Number(row.past), upcoming: Number(row.upcoming) },
    ]),
  )
  const keyCounts = new Map(
    byKey.map((row) => [
      row.token,
      { past: Number(row.past), upcoming: Number(row.upcoming) },
    ]),
  )

  for (const listing of listings) {
    const mlsId = listing.mlsId?.trim()
    const listingKey = listing.listingKey?.trim()
    const chosen =
      (mlsId ? idCounts.get(mlsId) : undefined) ??
      (listingKey ? keyCounts.get(listingKey) : undefined)
    if (!chosen) continue
    if (mlsId) counts.set(mlsId, chosen)
    if (listingKey) counts.set(listingKey, chosen)
  }

  return counts
}

export type OpenHouseJoinedRow = {
  oh_id: string
  listing_key: string | null
  listing_id: string | null
  oh_date: Date | string
  start_datetime: string | null
  end_datetime: string | null
  oh_type: string | null
  comment: string | null
  mls_id: string
  listing_listing_key: string | null
  property_type: string | null
  style: string | null
  postal_code: string | null
  address_city: string | null
  address_street: string | null
  address_full: string | null
  address_unit: string | null
  address_state: string | null
  price: number | string | null
  beds: number | string | null
  baths: number | string | null
  sqft: number | null
  year_built: number | null
  photo_count: number | null
  mls_status: string | null
  dom: number | null
  list_date: Date | string | null
  modification_timestamp: Date | string | null
  owner_name: string | null
}

const JOINED_OH_SELECT = `
              oh.id         AS oh_id,
              oh.listing_key,
              oh.listing_id,
              oh.oh_date,
              oh.start_datetime,
              oh.end_datetime,
              oh.oh_type,
              oh.comment,
              l.mls_id,
              l.listing_key AS listing_listing_key,
              l.property_type,
              l.style,
              l.postal_code,
              l.address_city,
              l.address_street,
              l.address_full,
              l.price,
              l.beds,
              l.baths,
              l.sqft,
              l.year_built,
              l.photo_count,
              l.mls_status,
              l.dom,
              l.list_date,
              l.modification_timestamp,
              l.data->>'ownerName' AS owner_name,
              l.data->'address'->>'unit' AS address_unit,
              l.data->'address'->>'state' AS address_state`

const ACTIVE_PRICED_LISTING = `
          l.status_bucket = 'Active'
          AND l.price IS NOT NULL AND l.price > 0`

/**
 * Remaining-week (or any date window) events joined to Active listings.
 * Equality joins only — listing_id first, listing_key when that path misses.
 */
export async function readOpenHousesJoinedToActiveListings(
  start: string,
  end: string,
): Promise<OpenHouseJoinedRow[]> {
  if (!(await openHousesTableExists())) await ensureOpenHousesTable()
  if (start > end) return []

  const [byId, byKey] = await Promise.all([
    query<OpenHouseJoinedRow>(
      `SELECT ${JOINED_OH_SELECT}
         FROM open_houses oh
         JOIN listings l ON l.mls_id = oh.listing_id
        WHERE oh.oh_date BETWEEN $1::date AND $2::date
          AND oh.listing_id IS NOT NULL
          AND ${ACTIVE_PRICED_LISTING}
        ORDER BY oh.oh_date ASC, oh.start_datetime ASC NULLS LAST`,
      [start, end],
    ),
    query<OpenHouseJoinedRow>(
      `SELECT ${JOINED_OH_SELECT}
         FROM open_houses oh
         JOIN listings l ON l.listing_key = oh.listing_key
        WHERE oh.oh_date BETWEEN $1::date AND $2::date
          AND oh.listing_key IS NOT NULL
          AND (oh.listing_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM listings x
                 WHERE x.mls_id = oh.listing_id
                   AND x.status_bucket = 'Active'
                   AND x.price IS NOT NULL AND x.price > 0
              ))
          AND ${ACTIVE_PRICED_LISTING}
        ORDER BY oh.oh_date ASC, oh.start_datetime ASC NULLS LAST`,
      [start, end],
    ),
  ])

  return [...byId, ...byKey]
}

/**
 * Stored OpenHouse rows for one property (this MLS id / key, plus prior
 * listings at the address). Equality lookups only — never OR across tokens.
 */
export async function readOpenHousesForListings(
  listings: readonly { mlsId?: string | null; listingKey?: string | null }[],
): Promise<OpenHouseEvent[]> {
  await ensureOpenHousesTable()
  const ids = [
    ...new Set(
      listings.map((row) => row.mlsId?.trim()).filter((id): id is string => Boolean(id)),
    ),
  ]
  const keys = [
    ...new Set(
      listings
        .map((row) => row.listingKey?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (ids.length === 0 && keys.length === 0) return []

  const [byId, byKey] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([] as OpenHouseRow[])
      : query<OpenHouseRow>(
          `SELECT id, listing_key, listing_id, oh_date, start_datetime,
                  end_datetime, oh_type, comment
             FROM open_houses
            WHERE listing_id = ANY($1::text[])
            ORDER BY oh_date DESC, start_datetime DESC NULLS LAST`,
          [ids],
        ),
    keys.length === 0
      ? Promise.resolve([] as OpenHouseRow[])
      : query<OpenHouseRow>(
          `SELECT id, listing_key, listing_id, oh_date, start_datetime,
                  end_datetime, oh_type, comment
             FROM open_houses
            WHERE listing_key = ANY($1::text[])
            ORDER BY oh_date DESC, start_datetime DESC NULLS LAST`,
          [keys],
        ),
  ])

  const seen = new Set<string>()
  const events: OpenHouseEvent[] = []
  for (const row of [...byId, ...byKey]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    events.push(mapRow(row))
  }
  events.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date)
    if (dateCmp !== 0) return dateCmp
    return (b.startDateTime ?? '').localeCompare(a.startDateTime ?? '')
  })
  return events
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
