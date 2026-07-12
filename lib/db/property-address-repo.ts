import 'server-only'

import {
  mergePropertyAddressSource,
  type PropertyAddressRow,
  type PropertyAddressSource,
} from '@/lib/property-address'
import type { Listing } from '@/lib/rets'
import { query, queryOne } from '@/lib/db/postgres'

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
  verified_at: Date | string
  synced_at: Date | string
}

function tsToIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  return value
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
    verifiedAt: tsToIso(row.verified_at),
    syncedAt: tsToIso(row.synced_at),
  }
}

const SELECT_COLUMNS = `
  property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
  listing_id, mls_id, source, verified_at, synced_at
`

export async function findPropertyAddressByNorm(
  town: string,
  addressNorm: string,
): Promise<PropertyAddressRow | null> {
  const row = await queryOne<DbRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM town_property_addresses
     WHERE lower(town) = lower($1) AND address_norm = $2
     LIMIT 1`,
    [town, addressNorm],
  )
  return row ? rowToModel(row) : null
}

export async function upsertPropertyAddress(
  draft: Omit<PropertyAddressRow, 'verifiedAt' | 'syncedAt'>,
  syncedAt: string,
): Promise<void> {
  const byNorm = await findPropertyAddressByNorm(draft.town, draft.addressNorm)
  const propertyKey =
    byNorm && byNorm.propertyKey.startsWith('addr:') && draft.propertyKey.startsWith('parcel:')
      ? draft.propertyKey
      : (byNorm?.propertyKey ?? draft.propertyKey)

  const existing = await queryOne<{
    property_key: string
    source: PropertyAddressSource
    listing_id: string | null
    mls_id: string | null
    parcel_number: string | null
  }>(
    `SELECT property_key, source, listing_id, mls_id, parcel_number
     FROM town_property_addresses
     WHERE property_key = $1`,
    [propertyKey],
  )

  if (
    byNorm &&
    byNorm.propertyKey !== propertyKey &&
    byNorm.propertyKey.startsWith('addr:') &&
    propertyKey.startsWith('parcel:')
  ) {
    await query('DELETE FROM town_property_addresses WHERE property_key = $1', [byNorm.propertyKey])
  }

  const source = mergePropertyAddressSource(existing?.source, draft.source)
  const listingId = draft.listingId ?? existing?.listing_id ?? byNorm?.listingId ?? null
  const mlsId = draft.mlsId ?? existing?.mls_id ?? byNorm?.mlsId ?? null
  const parcelNumber = draft.parcelNumber ?? existing?.parcel_number ?? byNorm?.parcelNumber ?? null

  await query(
    `INSERT INTO town_property_addresses (
      property_key, parcel_number, town, street, unit, zip, address_full, address_norm,
      listing_id, mls_id, source, verified_at, synced_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz
    )
    ON CONFLICT (property_key) DO UPDATE SET
      parcel_number = COALESCE(EXCLUDED.parcel_number, town_property_addresses.parcel_number),
      town = EXCLUDED.town,
      street = EXCLUDED.street,
      unit = COALESCE(EXCLUDED.unit, town_property_addresses.unit),
      zip = COALESCE(EXCLUDED.zip, town_property_addresses.zip),
      address_full = EXCLUDED.address_full,
      address_norm = EXCLUDED.address_norm,
      listing_id = COALESCE(EXCLUDED.listing_id, town_property_addresses.listing_id),
      mls_id = COALESCE(EXCLUDED.mls_id, town_property_addresses.mls_id),
      source = EXCLUDED.source,
      verified_at = EXCLUDED.verified_at,
      synced_at = EXCLUDED.synced_at`,
    [
      propertyKey,
      parcelNumber,
      draft.town,
      draft.street,
      draft.unit,
      draft.zip,
      draft.addressFull,
      draft.addressNorm,
      listingId,
      mlsId,
      source,
      syncedAt,
      syncedAt,
    ],
  )
}

export async function searchPropertyAddressesInDb(
  queryText: string,
  options: { limit?: number; town?: string } = {},
): Promise<PropertyAddressRow[]> {
  const q = queryText.trim().toLowerCase()
  if (q.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50)
  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const prefix = `${q}%`
  const town = options.town?.trim()

  const rows = town
    ? await query<DbRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM town_property_addresses
         WHERE lower(town) = lower($1)
           AND (
             lower(address_full) LIKE $2
             OR lower(street) LIKE $2
             OR lower(address_norm) LIKE $2
             OR lower(COALESCE(parcel_number, '')) LIKE $2
             OR lower(COALESCE(mls_id, '')) LIKE $2
           )
         ORDER BY
           CASE WHEN lower(street) LIKE $3 THEN 0 WHEN lower(address_full) LIKE $2 THEN 1 ELSE 2 END,
           address_full
         LIMIT $4`,
        [town, pattern, prefix, limit],
      )
    : await query<DbRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM town_property_addresses
         WHERE lower(address_full) LIKE $1
            OR lower(street) LIKE $1
            OR lower(address_norm) LIKE $1
            OR lower(COALESCE(parcel_number, '')) LIKE $1
            OR lower(COALESCE(mls_id, '')) LIKE $1
         ORDER BY
           CASE WHEN lower(street) LIKE $2 THEN 0 WHEN lower(address_full) LIKE $1 THEN 1 ELSE 2 END,
           town,
           address_full
         LIMIT $3`,
        [pattern, prefix, limit],
      )

  return rows.map(rowToModel)
}

export async function countPropertyAddresses(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM town_property_addresses',
  )
  return row ? Number(row.count) : 0
}

export async function loadMlsListingsForPropertySync(
  towns: readonly string[],
): Promise<{ listing: Listing; town: string; listingId: string; modMs: number }[]> {
  if (towns.length === 0) return []

  const placeholders = towns.map((_, index) => `$${index + 1}`).join(', ')
  const rows = await query<{
    id: string
    town: string
    data: Listing
    modification_timestamp: Date | string | null
  }>(
    `SELECT id, town, data, modification_timestamp
     FROM listings
     WHERE town IN (${placeholders})`,
    [...towns],
  )

  return rows
    .map((row) => {
      const listing = row.data as Listing
      const modMs = Date.parse(
        row.modification_timestamp instanceof Date
          ? row.modification_timestamp.toISOString()
          : (row.modification_timestamp ?? ''),
      ) || 0
      return { listing, town: row.town, listingId: row.id, modMs }
    })
    .filter((row) => {
      const street = row.listing.address.street?.trim() || row.listing.address.full?.trim()
      return Boolean(street)
    })
}
