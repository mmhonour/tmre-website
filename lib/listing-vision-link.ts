import 'server-only'

import { query } from '@/lib/db/postgres'
import type {
  ListingVisionLink,
  ListingVisionParcel,
} from '@/lib/listing-vision-link-shared'
import { westportFieldCardHref, westportParcelHref } from '@/lib/listing-url'
import { addressMatchKey } from '@/lib/vision-listing-match'
import {
  normalizePropertyAddress,
  normalizeStreetLine,
} from '@/lib/property-address'
import type { Listing } from '@/lib/rets'
import { resolveListingTownKey } from '@/lib/tmre-towns'
import { visionGisTownConfig } from '@/lib/vision-gis-towns'

export type {
  ListingVisionLink,
  ListingVisionParcel,
} from '@/lib/listing-vision-link-shared'

/** Only Westport has a `/find/{town}/[pid]` route today. */
const WESTPORT = 'Westport'

/**
 * Read-only projection of `vision_addresses`. Deliberately not the shared
 * `vision-addresses-repo` helpers: those call `ensureVisionAddressesTable()`,
 * whose `ALTER TABLE listings ADD COLUMN IF NOT EXISTS` takes an ACCESS
 * EXCLUSIVE lock on `listings` even as a no-op — not something a public listing
 * route should do on every cold start. A missing table just throws and is caught.
 */
const PARCEL_SELECT = `
  town, vision_pid, address_norm, address_full, mblu,
  use_code, use_code_description, owner_name, assessed_value,
  last_sale_price, last_sale_date, parcel_url, mls_id
`

type ParcelRow = {
  town: string
  vision_pid: string
  address_norm: string | null
  address_full: string | null
  mblu: string | null
  use_code: string | null
  use_code_description: string | null
  owner_name: string | null
  assessed_value: number | string | null
  last_sale_price: number | string | null
  last_sale_date: string | null
  parcel_url: string
  mls_id: string | null
}

function num(value: number | string | null): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function parcelFromRow(row: ParcelRow): ListingVisionParcel {
  const ownRoute = row.town === WESTPORT
  return {
    visionPid: row.vision_pid,
    parcelHref: ownRoute ? westportParcelHref(row.vision_pid) : null,
    fieldCardHref: ownRoute ? westportFieldCardHref(row.vision_pid) : null,
    vgsiHref: row.parcel_url,
    addressFull: row.address_full,
    mblu: row.mblu,
    useCode: row.use_code_description || row.use_code,
    ownerName: row.owner_name,
    assessedValue: num(row.assessed_value),
    lastSalePrice: num(row.last_sale_price),
    lastSaleDate: row.last_sale_date,
    linkedMlsId: row.mls_id?.trim() || null,
  }
}

async function parcelByPid(
  town: string,
  visionPid: string,
): Promise<ParcelRow | null> {
  const rows = await query<ParcelRow>(
    `SELECT ${PARCEL_SELECT} FROM vision_addresses
      WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
  return rows[0] ?? null
}

/**
 * Condo buildings are why most unstamped listings are unstamped: one street
 * address, one parcel per unit, so the match stack sees several PIDs and
 * declines. The MLS unit number picks the right one out of the set.
 */
function narrowToUnit(rows: ParcelRow[], unit: string): ParcelRow[] {
  const wanted = unit.trim().replace(/^#/, '').toLowerCase()
  if (!wanted) return rows
  const hits = rows.filter((row) => {
    const suffix = row.address_full?.toLowerCase().match(/#\s*([\w-]+)/)?.[1]
    return suffix === wanted
  })
  return hits.length ? hits : rows
}

/**
 * Parcels that look like the listing's address, for the unstamped case. Exact
 * `address_norm` first; then a street prefix / contains pass, narrowed to rows
 * whose join key matches the way the match stack computes it.
 */
async function candidateParcels(
  town: string,
  listing: Listing,
): Promise<ParcelRow[]> {
  const street = listing.address.street?.trim() || ''
  if (street.length < 3) return []
  const unit = listing.address.unit?.trim() || ''

  const exact = await query<ParcelRow>(
    `SELECT ${PARCEL_SELECT} FROM vision_addresses
      WHERE town = $1 AND address_norm = $2
      ORDER BY mblu NULLS LAST, vision_pid
      LIMIT 12`,
    [town, normalizePropertyAddress(town, street, null)],
  )
  if (exact.length) return narrowToUnit(exact, unit).slice(0, 4)

  const streetLine = normalizeStreetLine(street).replace(/[%_]/g, '')
  if (!streetLine) return []
  const loose = await query<ParcelRow>(
    `SELECT ${PARCEL_SELECT} FROM vision_addresses
      WHERE town = $1
        AND (address_norm LIKE $2 OR lower(coalesce(address_full, '')) LIKE $3)
      ORDER BY address_full NULLS LAST, vision_pid
      LIMIT 16`,
    [town, `${streetLine}%`, `%${streetLine}%`],
  )

  const wanted = addressMatchKey(
    normalizePropertyAddress(town, street, listing.address.postalCode),
  )
  const keyed = loose.filter(
    (row) => row.address_norm && addressMatchKey(row.address_norm) === wanted,
  )
  return narrowToUnit(keyed.length ? keyed : loose, unit).slice(0, 4)
}

/**
 * Pair a listing with its VGSI parcel for the Admin panel.
 *
 * `listings.vision_pid` is the authoritative side of the join — the Vision match
 * stack (`backfillVisionListingLinks`) stamps it only when exactly one parcel
 * matches the address. Returns null outside Vision-covered towns (Westport
 * today) and never throws: a Vision hiccup must not take down a listing payload.
 */
export async function resolveListingVisionLink(
  listing: Listing | null,
): Promise<ListingVisionLink | null> {
  if (!listing) return null
  const town = resolveListingTownKey(
    listing.address.postalCode,
    listing.address.city,
  )
  if (!town || !visionGisTownConfig(town)) return null

  const stampedPid = listing.visionPid?.trim() || null

  try {
    if (stampedPid) {
      const row = await parcelByPid(town, stampedPid)
      return {
        town,
        stamped: true,
        parcel: row ? parcelFromRow(row) : null,
        candidates: [],
        danglingPid: row ? null : stampedPid,
      }
    }

    const candidates = await candidateParcels(town, listing)
    return {
      town,
      stamped: false,
      parcel: null,
      candidates: candidates.map(parcelFromRow),
      danglingPid: null,
    }
  } catch (err) {
    console.warn(
      '[listing-vision-link] resolve failed',
      listing.mlsId,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
