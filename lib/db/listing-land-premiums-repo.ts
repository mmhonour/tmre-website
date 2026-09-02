import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import { isRentalListing } from '@/lib/listing-kind'
import type { LandStretchInsight, StretchSale } from '@/lib/listing-land-stretch'

/**
 * Per-listing land-stretch premium (sold PPSF on a 1/4-mile corridor).
 * Netlify does not auto-migrate; ensure the table on first use.
 */

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS listing_land_premiums (
  listing_id text PRIMARY KEY,
  algo_version integer NOT NULL,
  axis text,
  sold_count integer NOT NULL DEFAULT 0,
  stretch_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  stretch_premium_pct numeric,
  listing_premium_pct numeric,
  explains_land boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL
)
`

let ensured = false

export async function ensureListingLandPremiumsTable(): Promise<void> {
  if (ensured) return
  await query(CREATE_SQL)
  ensured = true
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function tsToIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function labelsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

export type ListingLandPremiumRow = LandStretchInsight & {
  listingId: string
  computedAt: string
}

export async function upsertListingLandPremium(row: {
  listingId: string
  insight: LandStretchInsight
  computedAt: string
}): Promise<void> {
  await ensureListingLandPremiumsTable()
  const { insight, listingId, computedAt } = row
  await query(
    `INSERT INTO listing_land_premiums (
       listing_id, algo_version, axis, sold_count,
       stretch_median_ppsf, city_median_ppsf, listing_ppsf,
       stretch_premium_pct, listing_premium_pct, explains_land,
       labels, payload, computed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
     )
     ON CONFLICT (listing_id) DO UPDATE SET
       algo_version = EXCLUDED.algo_version,
       axis = EXCLUDED.axis,
       sold_count = EXCLUDED.sold_count,
       stretch_median_ppsf = EXCLUDED.stretch_median_ppsf,
       city_median_ppsf = EXCLUDED.city_median_ppsf,
       listing_ppsf = EXCLUDED.listing_ppsf,
       stretch_premium_pct = EXCLUDED.stretch_premium_pct,
       listing_premium_pct = EXCLUDED.listing_premium_pct,
       explains_land = EXCLUDED.explains_land,
       labels = EXCLUDED.labels,
       payload = EXCLUDED.payload,
       computed_at = EXCLUDED.computed_at`,
    [
      listingId,
      insight.algoVersion,
      insight.axis,
      insight.soldCount,
      insight.stretchMedianPpsf,
      insight.cityMedianPpsf,
      insight.listingPpsf,
      insight.stretchPremiumPct,
      insight.listingPremiumPct,
      insight.explainsLandPremium,
      JSON.stringify(insight.labels),
      JSON.stringify({ candidates: insight.candidates }),
      computedAt,
    ],
  )
}

export async function readListingLandPremium(
  listingId: string,
): Promise<ListingLandPremiumRow | null> {
  const id = listingId.trim()
  if (!id) return null
  await ensureListingLandPremiumsTable()
  const row = await queryOne<{
    listing_id: string
    algo_version: number
    axis: string | null
    sold_count: number
    stretch_median_ppsf: unknown
    city_median_ppsf: unknown
    listing_ppsf: unknown
    stretch_premium_pct: unknown
    listing_premium_pct: unknown
    explains_land: boolean
    labels: unknown
    payload: unknown
    computed_at: Date | null
  }>(
    `SELECT listing_id, algo_version, axis, sold_count,
            stretch_median_ppsf, city_median_ppsf, listing_ppsf,
            stretch_premium_pct, listing_premium_pct, explains_land,
            labels, payload, computed_at
       FROM listing_land_premiums
      WHERE listing_id = $1
      LIMIT 1`,
    [id],
  )
  if (!row) return null

  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as { candidates?: LandStretchInsight['candidates'] })
      : {}

  const axis = row.axis
  return {
    listingId: row.listing_id,
    algoVersion: row.algo_version,
    axis:
      axis === 'water' || axis === 'center' || axis === 'street' ? axis : null,
    soldCount: row.sold_count,
    stretchMedianPpsf: numOrNull(row.stretch_median_ppsf),
    cityMedianPpsf: numOrNull(row.city_median_ppsf),
    listingPpsf: numOrNull(row.listing_ppsf),
    stretchPremiumPct: numOrNull(row.stretch_premium_pct),
    listingPremiumPct: numOrNull(row.listing_premium_pct),
    explainsLandPremium: row.explains_land === true,
    labels: labelsFromJson(row.labels),
    candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
    computedAt: tsToIso(row.computed_at) ?? '',
  }
}

export type ClosedSaleGeoRow = {
  id: string
  mlsId: string
  latitude: number
  longitude: number
  closePrice: number
  closeDate: string
  sqft: number
  beds: number | null
  baths: number | null
  street: string | null
  propertyType: string
}

/**
 * Closed sales in a small lat/lon box for one town. Used only as a fetch
 * window — the stretch filter (not this box) defines the land corridor.
 */
export async function readClosedSalesInBounds(args: {
  town: string
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  closeDateFromIso: string
}): Promise<ClosedSaleGeoRow[]> {
  const rows = await query<{
    id: string
    mls_id: string | null
    latitude: unknown
    longitude: unknown
    close_price: unknown
    close_date: Date | string | null
    sqft: unknown
    beds: unknown
    baths: unknown
    address_street: string | null
    property_type: string | null
  }>(
    `SELECT id, mls_id, latitude, longitude, close_price, close_date,
            sqft, beds, baths, address_street, property_type
       FROM listings
      WHERE status_bucket = 'Closed'
        AND town = $1
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND close_price > 0 AND sqft > 0
        AND close_date >= $2
        AND latitude BETWEEN $3 AND $4
        AND longitude BETWEEN $5 AND $6`,
    [
      args.town,
      args.closeDateFromIso,
      args.minLat,
      args.maxLat,
      args.minLon,
      args.maxLon,
    ],
  )

  const out: ClosedSaleGeoRow[] = []
  for (const row of rows) {
    const latitude = numOrNull(row.latitude)
    const longitude = numOrNull(row.longitude)
    const closePrice = numOrNull(row.close_price)
    const sqft = numOrNull(row.sqft)
    if (
      latitude == null ||
      longitude == null ||
      closePrice == null ||
      sqft == null ||
      sqft <= 0
    ) {
      continue
    }
    const propertyType = (row.property_type ?? '').trim()
    if (isRentalListing({ propertyType })) continue
    const closeDate = tsToIso(row.close_date)
    if (!closeDate) continue
    out.push({
      id: row.id,
      mlsId: (row.mls_id ?? '').trim(),
      latitude,
      longitude,
      closePrice,
      closeDate,
      sqft,
      beds: numOrNull(row.beds),
      baths: numOrNull(row.baths),
      street: row.address_street,
      propertyType,
    })
  }
  return out
}

export function closedSaleToStretchSale(row: ClosedSaleGeoRow): StretchSale {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    pricePerSqft: row.closePrice / row.sqft,
    closeDate: row.closeDate,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    street: row.street,
  }
}
