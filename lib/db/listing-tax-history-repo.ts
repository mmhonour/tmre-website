import 'server-only'

import { chunkedUpsert } from '@/lib/db/chunked-upsert'
import { query } from '@/lib/db/postgres'
import { getUpsertChunkRows } from '@/lib/db/db-write-tuning'
import type { ComputedTaxRow, ListingParcelCandidate } from '@/lib/ct-cama-tax-compute'
import { assessedValueFromRaw, parseTaxYearEnd } from '@/lib/listing-property-tax'

const TAX_HISTORY_COMPUTED_COLUMNS = [
  { name: 'listing_id' },
  { name: 'parcel_number' },
  { name: 'tax_year_label' },
  { name: 'tax_year_end' },
  { name: 'amount' },
  { name: 'synced_at' },
  { name: 'source' },
  { name: 'town' },
  { name: 'assessed_value' },
  { name: 'assessment_year' },
  { name: 'assessment_carried_forward' },
  { name: 'mill_rate' },
]

/**
 * Listings in a town with the fields needed to reach their assessor parcel.
 *
 * One row per parcel: a house that is listed, expires, and relists produces
 * several listings sharing a `ParcelNumber`, and tax history is keyed by parcel,
 * so the freshest listing wins and the rest would only write the same values
 * under a different `listing_id`.
 */
export async function readListingParcelCandidates(
  town: string,
): Promise<ListingParcelCandidate[]> {
  const rows = await query<{
    listingId: string
    town: string
    parcelNumber: string | null
    visionPid: string | null
    street: string | null
    assessedValueRaw: string | null
    taxYearLabel: string | null
  }>(
    `SELECT DISTINCT ON (COALESCE(NULLIF(btrim(raw->>'ParcelNumber'), ''), id))
       id AS "listingId",
       town,
       NULLIF(btrim(raw->>'ParcelNumber'), '') AS "parcelNumber",
       NULLIF(btrim(vision_pid), '')           AS "visionPid",
       COALESCE(
         NULLIF(btrim(address_street), ''),
         NULLIF(btrim(data->'address'->>'street'), '')
       )                                       AS street,
       NULLIF(btrim(raw->>'AssessedValue'), '') AS "assessedValueRaw",
       COALESCE(
         NULLIF(btrim(property_tax_year), ''),
         NULLIF(btrim(raw->>'TaxYear'), '')
       )                                       AS "taxYearLabel"
     FROM listings
     WHERE town = $1
     ORDER BY
       COALESCE(NULLIF(btrim(raw->>'ParcelNumber'), ''), id),
       (status_bucket = 'Active') DESC,
       synced_at DESC`,
    [town],
  )

  return rows.map((row) => ({
    listingId: row.listingId,
    town: row.town,
    parcelNumber: row.parcelNumber,
    visionPid: row.visionPid,
    street: row.street,
    assessedValue: assessedValueFromRaw({
      AssessedValue: row.assessedValueRaw ?? '',
    }),
    taxYearEnd: parseTaxYearEnd(row.taxYearLabel),
  }))
}

/**
 * `parcel_number|tax_year_end` keys already held by an MLS-reported row.
 *
 * The MLS feed reports one real, billed figure per listing and incremental sync
 * rewrites it every half hour. A computed row must not displace it — not just
 * because the reported number is better, but because sync would win the next
 * tick anyway and leave the table flip-flopping. Historical MLS rows exist
 * wherever a listing was synced in an earlier fiscal year, so this is checked
 * for every year rather than only the current one.
 */
export async function readMlsOwnedTaxYearKeys(
  town: string,
): Promise<Set<string>> {
  const rows = await query<{ parcel_number: string; tax_year_end: number }>(
    `SELECT DISTINCT h.parcel_number, h.tax_year_end
       FROM listing_tax_history h
       JOIN listings l ON l.id = h.listing_id
      WHERE l.town = $1 AND h.source = 'mls'`,
    [town],
  )
  return new Set(rows.map((row) => `${row.parcel_number}|${row.tax_year_end}`))
}

export async function upsertComputedTaxHistory(
  rows: readonly ComputedTaxRow[],
  syncedAt: Date,
): Promise<number> {
  if (rows.length === 0) return 0
  return chunkedUpsert({
    table: 'listing_tax_history',
    columns: TAX_HISTORY_COMPUTED_COLUMNS,
    conflictColumns: ['parcel_number', 'tax_year_end'],
    rows: rows.map((row) => [
      row.listingId,
      row.parcelNumber,
      row.taxYearLabel,
      row.taxYearEnd,
      row.amount,
      syncedAt,
      'cama',
      row.town,
      row.assessedValue,
      row.assessmentYear,
      row.assessmentCarriedForward,
      row.millRate,
    ]),
    chunkRows: getUpsertChunkRows(),
  })
}

export type TaxHistoryCoverageRow = {
  town: string | null
  taxYearEnd: number
  source: string
  rows: number
}

/** Filled years by town and writer, for Admin coverage reporting. */
export async function readTaxHistoryCoverage(): Promise<TaxHistoryCoverageRow[]> {
  const rows = await query<{
    town: string | null
    tax_year_end: number
    source: string
    rows: string
  }>(
    `SELECT town, tax_year_end, source, count(1) AS rows
       FROM listing_tax_history
      GROUP BY town, tax_year_end, source
      ORDER BY tax_year_end DESC, town`,
  )
  return rows.map((row) => ({
    town: row.town,
    taxYearEnd: row.tax_year_end,
    source: row.source,
    rows: Number(row.rows) || 0,
  }))
}
