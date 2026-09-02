import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import { isRentalListing } from '@/lib/listing-kind'
import type { LocationEstimate, EstimateSale } from '@/lib/listing-location-estimates'

/**
 * Current location estimate + snapshots (coastal areas / town centers).
 * Netlify does not auto-migrate; ensure tables on first use.
 */

const CREATE_CURRENT_SQL = `
CREATE TABLE IF NOT EXISTS listing_location_estimates (
  listing_id text PRIMARY KEY,
  algo_version integer NOT NULL,
  kind text,
  sold_count integer NOT NULL DEFAULT 0,
  sold_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  sold_premium_pct numeric,
  listing_premium_pct numeric,
  explains_location boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL
)
`

const CREATE_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS listing_location_estimate_snapshots (
  listing_id text NOT NULL,
  computed_at timestamptz NOT NULL,
  algo_version integer NOT NULL,
  kind text,
  sold_count integer NOT NULL DEFAULT 0,
  sold_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  sold_premium_pct numeric,
  listing_premium_pct numeric,
  explains_location boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (listing_id, computed_at)
)
`

let ensured = false

export async function ensureLocationEstimateTables(): Promise<void> {
  if (ensured) return
  await query(CREATE_CURRENT_SQL)
  await query(CREATE_SNAPSHOTS_SQL)
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

function parseKind(value: string | null): LocationEstimate['kind'] {
  if (value === 'coastal' || value === 'town_center' || value === 'street') {
    return value
  }
  return null
}

export type LocationEstimateRow = LocationEstimate & {
  listingId: string
  computedAt: string
}

export async function upsertLocationEstimate(row: {
  listingId: string
  estimate: LocationEstimate
  computedAt: string
}): Promise<void> {
  await ensureLocationEstimateTables()
  const { estimate, listingId, computedAt } = row
  await query(
    `INSERT INTO listing_location_estimates (
       listing_id, algo_version, kind, sold_count,
       sold_median_ppsf, city_median_ppsf, listing_ppsf,
       sold_premium_pct, listing_premium_pct, explains_location,
       labels, payload, computed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
     )
     ON CONFLICT (listing_id) DO UPDATE SET
       algo_version = EXCLUDED.algo_version,
       kind = EXCLUDED.kind,
       sold_count = EXCLUDED.sold_count,
       sold_median_ppsf = EXCLUDED.sold_median_ppsf,
       city_median_ppsf = EXCLUDED.city_median_ppsf,
       listing_ppsf = EXCLUDED.listing_ppsf,
       sold_premium_pct = EXCLUDED.sold_premium_pct,
       listing_premium_pct = EXCLUDED.listing_premium_pct,
       explains_location = EXCLUDED.explains_location,
       labels = EXCLUDED.labels,
       payload = EXCLUDED.payload,
       computed_at = EXCLUDED.computed_at`,
    [
      listingId,
      estimate.algoVersion,
      estimate.kind ?? estimate.axis,
      estimate.soldCount,
      estimate.soldMedianPpsf,
      estimate.cityMedianPpsf,
      estimate.listingPpsf,
      estimate.soldPremiumPct,
      estimate.listingPremiumPct,
      estimate.explainsLocation,
      JSON.stringify(estimate.labels),
      JSON.stringify({ candidates: estimate.candidates }),
      computedAt,
    ],
  )
  await query(
    `INSERT INTO listing_location_estimate_snapshots (
       listing_id, computed_at, algo_version, kind, sold_count,
       sold_median_ppsf, city_median_ppsf, listing_ppsf,
       sold_premium_pct, listing_premium_pct, explains_location, payload
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
     )
     ON CONFLICT (listing_id, computed_at) DO NOTHING`,
    [
      listingId,
      computedAt,
      estimate.algoVersion,
      estimate.kind ?? estimate.axis,
      estimate.soldCount,
      estimate.soldMedianPpsf,
      estimate.cityMedianPpsf,
      estimate.listingPpsf,
      estimate.soldPremiumPct,
      estimate.listingPremiumPct,
      estimate.explainsLocation,
      JSON.stringify({ candidates: estimate.candidates, labels: estimate.labels }),
    ],
  )
}

export async function readLocationEstimateRow(
  listingId: string,
): Promise<LocationEstimateRow | null> {
  const id = listingId.trim()
  if (!id) return null
  await ensureLocationEstimateTables()
  const row = await queryOne<{
    listing_id: string
    algo_version: number
    kind: string | null
    sold_count: number
    sold_median_ppsf: unknown
    city_median_ppsf: unknown
    listing_ppsf: unknown
    sold_premium_pct: unknown
    listing_premium_pct: unknown
    explains_location: boolean
    labels: unknown
    payload: unknown
    computed_at: Date | null
  }>(
    `SELECT listing_id, algo_version, kind, sold_count,
            sold_median_ppsf, city_median_ppsf, listing_ppsf,
            sold_premium_pct, listing_premium_pct, explains_location,
            labels, payload, computed_at
       FROM listing_location_estimates
      WHERE listing_id = $1
      LIMIT 1`,
    [id],
  )
  if (!row) return null
  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as { candidates?: LocationEstimate['candidates'] })
      : {}
  const kind = parseKind(row.kind)
  return {
    listingId: row.listing_id,
    algoVersion: row.algo_version,
    kind,
    axis: kind,
    soldCount: row.sold_count,
    soldMedianPpsf: numOrNull(row.sold_median_ppsf),
    cityMedianPpsf: numOrNull(row.city_median_ppsf),
    listingPpsf: numOrNull(row.listing_ppsf),
    soldPremiumPct: numOrNull(row.sold_premium_pct),
    listingPremiumPct: numOrNull(row.listing_premium_pct),
    explainsLocation: row.explains_location === true,
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

export function closedSaleToEstimateSale(row: ClosedSaleGeoRow): EstimateSale {
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
