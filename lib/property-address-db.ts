type SqliteDatabase = import('better-sqlite3').Database
import {
  mergePropertyAddressSource,
  type PropertyAddressRow,
  type PropertyAddressSource,
} from '@/lib/property-address'
import { getListingsDb, isListingsDbAvailable, tryGetReadDb } from '@/lib/listings-db'
import { setSyncMeta } from '@/lib/db/sync-meta-store'

function readDb(): import('better-sqlite3').Database | null {
  return tryGetReadDb() ?? (isListingsDbAvailable() ? getListingsDb() : null)
}

export function ensurePropertyAddressSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS town_property_addresses (
      property_key TEXT PRIMARY KEY,
      parcel_number TEXT,
      town TEXT NOT NULL,
      street TEXT NOT NULL,
      unit TEXT,
      zip TEXT,
      address_full TEXT NOT NULL,
      address_norm TEXT NOT NULL,
      listing_id TEXT,
      mls_id TEXT,
      source TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tpa_town_norm
      ON town_property_addresses (town, address_norm);

    CREATE INDEX IF NOT EXISTS idx_tpa_address_norm
      ON town_property_addresses (address_norm);

    CREATE INDEX IF NOT EXISTS idx_tpa_parcel
      ON town_property_addresses (parcel_number)
      WHERE parcel_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_listing_id
      ON town_property_addresses (listing_id)
      WHERE listing_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_search
      ON town_property_addresses (address_full COLLATE NOCASE);
  `)
}

type DbRow = {
  property_key: string
  parcel_number: string | null
  town: string
  street: string
  unit: string | null
  zip: string | null
  address_full: string
  address_norm: string
  listing_id: string | null
  mls_id: string | null
  source: PropertyAddressSource
  verified_at: string
  synced_at: string
}

function rowToModel(row: DbRow): PropertyAddressRow {
  return {
    propertyKey: row.property_key,
    parcelNumber: row.parcel_number,
    town: row.town,
    street: row.street,
    unit: row.unit,
    zip: row.zip,
    addressFull: row.address_full,
    addressNorm: row.address_norm,
    listingId: row.listing_id,
    mlsId: row.mls_id,
    source: row.source,
    verifiedAt: row.verified_at,
    syncedAt: row.synced_at,
  }
}

export function findPropertyAddressByNorm(
  town: string,
  addressNorm: string,
  database?: import('better-sqlite3').Database,
): PropertyAddressRow | null {
  const db = database ?? readDb()
  if (!db) return null

  const row = db
    .prepare(
      `SELECT property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
              listing_id, mls_id, source, verified_at, synced_at
       FROM town_property_addresses
       WHERE lower(town) = lower(?) AND address_norm = ?
       LIMIT 1`,
    )
    .get(town, addressNorm) as DbRow | undefined

  return row ? rowToModel(row) : null
}

export function upsertPropertyAddress(
  draft: Omit<PropertyAddressRow, 'verifiedAt' | 'syncedAt'>,
  syncedAt: string,
): void {
  const database = getListingsDb()

  const byNorm = findPropertyAddressByNorm(draft.town, draft.addressNorm, database)
  const propertyKey =
    byNorm && byNorm.propertyKey.startsWith('addr:') && draft.propertyKey.startsWith('parcel:')
      ? draft.propertyKey
      : byNorm?.propertyKey ?? draft.propertyKey

  const existing = database
    .prepare(
      `SELECT property_key, source, listing_id, mls_id, parcel_number
       FROM town_property_addresses
       WHERE property_key = ?`,
    )
    .get(propertyKey) as
    | {
        property_key: string
        source: PropertyAddressSource
        listing_id: string | null
        mls_id: string | null
        parcel_number: string | null
      }
    | undefined

  if (
    byNorm &&
    byNorm.propertyKey !== propertyKey &&
    byNorm.propertyKey.startsWith('addr:') &&
    propertyKey.startsWith('parcel:')
  ) {
    database.prepare('DELETE FROM town_property_addresses WHERE property_key = ?').run(byNorm.propertyKey)
  }

  const source = mergePropertyAddressSource(existing?.source, draft.source)
  const listingId = draft.listingId ?? existing?.listing_id ?? byNorm?.listingId ?? null
  const mlsId = draft.mlsId ?? existing?.mls_id ?? byNorm?.mlsId ?? null
  const parcelNumber = draft.parcelNumber ?? existing?.parcel_number ?? byNorm?.parcelNumber ?? null

  database
    .prepare(
      `INSERT INTO town_property_addresses (
        property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
        listing_id, mls_id, source, verified_at, synced_at
      ) VALUES (
        @property_key, @parcel_number, @town, @street, @unit, @zip, @address_full, @address_norm,
        @listing_id, @mls_id, @source, @verified_at, @synced_at
      )
      ON CONFLICT(property_key) DO UPDATE SET
        parcel_number = COALESCE(excluded.parcel_number, town_property_addresses.parcel_number),
        town = excluded.town,
        street = excluded.street,
        unit = COALESCE(excluded.unit, town_property_addresses.unit),
        zip = COALESCE(excluded.zip, town_property_addresses.zip),
        address_full = excluded.address_full,
        address_norm = excluded.address_norm,
        listing_id = COALESCE(excluded.listing_id, town_property_addresses.listing_id),
        mls_id = COALESCE(excluded.mls_id, town_property_addresses.mls_id),
        source = excluded.source,
        verified_at = excluded.verified_at,
        synced_at = excluded.synced_at`,
    )
    .run({
      property_key: propertyKey,
      parcel_number: parcelNumber,
      town: draft.town,
      street: draft.street,
      unit: draft.unit,
      zip: draft.zip,
      address_full: draft.addressFull,
      address_norm: draft.addressNorm,
      listing_id: listingId,
      mls_id: mlsId,
      source,
      verified_at: syncedAt,
      synced_at: syncedAt,
    })
}

export function searchPropertyAddressesInDb(
  query: string,
  options: { limit?: number; town?: string } = {},
): PropertyAddressRow[] {
  const database = readDb()
  if (!database) return []

  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50)
  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const town = options.town?.trim()

  const sql = town
    ? `SELECT property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
              listing_id, mls_id, source, verified_at, synced_at
       FROM town_property_addresses
       WHERE lower(town) = lower(?)
         AND (
           lower(address_full) LIKE ?
           OR lower(street) LIKE ?
           OR lower(address_norm) LIKE ?
           OR lower(COALESCE(parcel_number, '')) LIKE ?
           OR lower(COALESCE(mls_id, '')) LIKE ?
         )
       ORDER BY
         CASE WHEN lower(street) LIKE ? THEN 0 WHEN lower(address_full) LIKE ? THEN 1 ELSE 2 END,
         address_full
       LIMIT ?`
    : `SELECT property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
              listing_id, mls_id, source, verified_at, synced_at
       FROM town_property_addresses
       WHERE lower(address_full) LIKE ?
          OR lower(street) LIKE ?
          OR lower(address_norm) LIKE ?
          OR lower(COALESCE(parcel_number, '')) LIKE ?
          OR lower(COALESCE(mls_id, '')) LIKE ?
       ORDER BY
         CASE WHEN lower(street) LIKE ? THEN 0 WHEN lower(address_full) LIKE ? THEN 1 ELSE 2 END,
         town,
         address_full
       LIMIT ?`

  const prefix = `${q}%`
  const rows = town
    ? (database.prepare(sql).all(town, pattern, pattern, pattern, pattern, pattern, prefix, pattern, limit) as DbRow[])
    : (database.prepare(sql).all(pattern, pattern, pattern, pattern, pattern, prefix, pattern, limit) as DbRow[])

  return rows.map(rowToModel)
}

export function countPropertyAddresses(): number {
  const database = readDb()
  if (!database) return 0
  const row = database.prepare('SELECT COUNT(*) AS count FROM town_property_addresses').get() as {
    count: number
  }
  return row.count
}

export function touchPropertyAddressSyncMeta(stats: {
  mlsRows: number
  assessorRows: number
  totalRows: number
  durationMs: number
}): void {
  const now = new Date().toISOString()
  setSyncMeta('property_addresses_synced_at', now)
  setSyncMeta(
    'property_addresses_last_stats',
    JSON.stringify({
      ...stats,
      syncedAt: now,
    }),
  )
}
