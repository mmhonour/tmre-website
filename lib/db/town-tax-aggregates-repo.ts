import 'server-only'

import { query } from '@/lib/db/postgres'
import { listingKindClauseSql, LISTING_KIND_HAY_SQL } from '@/lib/db/stats-aggregates-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'

/**
 * Town-level property tax aggregates for Market Pulse.
 *
 * Pool: every listing (any status) with a plausible tax amount for the
 * chosen fiscal year (listing_tax_history, else listings.property_tax when
 * the MLS year label matches). Current vs prior is picked by an 80% quorum
 * of the listing book — not a five-year mix.
 */

const COMMERCIAL = 'commercial|industrial|business'
const CONDO = 'condo|condominium|co-?op|cooperative'
const MULTI =
  'multi|duplex|triplex|fourplex|2-family|3-family|4-family|two[ -]?family|three[ -]?family|four[ -]?family|residential\\s*income|income\\s*property'

const CLASS_HAY_SQL = `concat_ws(' ', property_type, data->>'style',
          raw->>'PropertyType', raw->>'PropertySubType',
          raw->>'MRD_TYP', raw->>'ArchitecturalStyle')`

function classClauseSql(
  propertyClass?: ListingPropertyClass,
  commercialOnly?: boolean,
): string {
  if (commercialOnly) return `hay ~* '${COMMERCIAL}'`
  if (propertyClass === 'condos') return `hay ~* '${CONDO}'`
  if (propertyClass === 'multi') return `hay ~* '${MULTI}'`
  if (propertyClass === 'homes') {
    return `hay !~* '${COMMERCIAL}' AND hay !~* '${CONDO}' AND hay !~* '${MULTI}'`
  }
  return 'true'
}

function num(value: string | number | null): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function int(value: string | number | null): number {
  return Math.round(num(value) ?? 0)
}

const PARCEL_SQL = `COALESCE(NULLIF(btrim(l.raw->>'ParcelNumber'), ''), l.id)`

/** Last 4-digit year in MLS TaxYear / property_tax_year ("July 2025-June 2026" → 2026). */
const MLS_TAX_YEAR_END_SQL = `(
  (regexp_match(COALESCE(l.property_tax_year, ''), '([0-9]{4})\\s*$'))[1]
)::int`

const TAX_AMOUNT_SQL = `COALESCE(
  h.amount,
  CASE WHEN ${MLS_TAX_YEAR_END_SQL} = y.tax_year_end THEN l.property_tax END
)`

/** Drop Matrix TBD bills: 99999, 999999, 9999999, … — keep $9,999. */
const TAX_AMOUNT_PLAUSIBLE_SQL = `(
  ${TAX_AMOUNT_SQL} IS NOT NULL
  AND ${TAX_AMOUNT_SQL} > 0
  AND round(${TAX_AMOUNT_SQL})::text !~ '^9{5,}$'
)`

const HISTORY_AMOUNT_PLAUSIBLE_SQL = `(
  h.amount > 0
  AND round(h.amount)::text !~ '^9{5,}$'
)`

export type TownTaxYearCoverage = {
  taxYearEnd: number
  listingCount: number
}

export type TownTaxCoverageScope = {
  towns: readonly string[]
  yearEnds: readonly number[]
  kind?: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}

export type TownTaxAggregateRow = {
  town: string
  sampleSize: number
  medianTax: number | null
  averageTax: number | null
}

export type TownTaxAggregateScope = {
  towns: readonly string[]
  taxYearEnds: readonly number[]
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}

/** Listings in the Pulse scope — the 80% tipping-point denominator. */
export async function readPulseTaxListingUniverse(options: {
  towns: readonly string[]
  kind?: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}): Promise<number> {
  const towns = [...options.towns]
  if (towns.length === 0) return 0
  const kindClause = listingKindClauseSql(options.kind ?? 'sale')
  const classClause = classClauseSql(options.propertyClass, options.commercialOnly)
  const rows = await query<{ listing_count: number }>(
    `SELECT count(*)::int AS listing_count
       FROM listings l
       CROSS JOIN LATERAL (
         SELECT ${CLASS_HAY_SQL} AS hay,
                ${LISTING_KIND_HAY_SQL} AS kind_hay
       ) fields
      WHERE l.town = ANY($1::text[])
        AND ${kindClause}
        AND ${classClause}`,
    [towns],
  )
  return int(rows[0]?.listing_count ?? 0)
}

/** How many listings (any status) have a tax amount for each candidate FY. */
export async function readPulseTaxYearCoverage(
  options: TownTaxCoverageScope,
): Promise<TownTaxYearCoverage[]> {
  const towns = [...options.towns]
  const years = [...options.yearEnds]
  if (towns.length === 0 || years.length === 0) return []
  const kindClause = listingKindClauseSql(options.kind ?? 'sale')
  const classClause = classClauseSql(options.propertyClass, options.commercialOnly)

  const rows = await query<{ tax_year_end: number; listing_count: number }>(
    `WITH years AS (
       SELECT unnest($2::int[]) AS tax_year_end
     ),
     eligible AS (
       SELECT DISTINCT
         l.id,
         y.tax_year_end
         FROM listings l
         CROSS JOIN years y
         LEFT JOIN listing_tax_history h
           ON h.parcel_number = ${PARCEL_SQL}
          AND h.tax_year_end = y.tax_year_end
          AND ${HISTORY_AMOUNT_PLAUSIBLE_SQL}
        CROSS JOIN LATERAL (
          SELECT ${CLASS_HAY_SQL} AS hay,
                 ${LISTING_KIND_HAY_SQL} AS kind_hay
        ) fields
        WHERE l.town = ANY($1::text[])
          AND ${kindClause}
          AND ${classClause}
          AND ${TAX_AMOUNT_PLAUSIBLE_SQL}
     )
     SELECT tax_year_end, count(*)::int AS listing_count
       FROM eligible
      GROUP BY tax_year_end`,
    [towns, years],
  )

  const byYear = new Map(rows.map((r) => [r.tax_year_end, r.listing_count]))
  return years.map((taxYearEnd) => ({
    taxYearEnd,
    listingCount: byYear.get(taxYearEnd) ?? 0,
  }))
}

/** Per-town + All-towns median/mean of the chosen fiscal year’s tax. */
export async function readTownTaxAggregates(
  scope: TownTaxAggregateScope,
): Promise<TownTaxAggregateRow[]> {
  const towns = [...scope.towns]
  const taxYearEnds = [...scope.taxYearEnds]
  if (towns.length === 0 || taxYearEnds.length === 0) return []

  const kindClause = listingKindClauseSql(scope.kind)
  const classClause = classClauseSql(scope.propertyClass, scope.commercialOnly)

  const rows = await query<{
    town: string
    sample_size: number
    median_tax: string | number | null
    average_tax: string | number | null
  }>(
    `WITH years AS (
       SELECT unnest($2::int[]) AS tax_year_end
     ),
     eligible AS (
       SELECT
         l.town,
         ${TAX_AMOUNT_SQL} AS tax_amount
         FROM listings l
         CROSS JOIN years y
         LEFT JOIN listing_tax_history h
           ON h.parcel_number = ${PARCEL_SQL}
          AND h.tax_year_end = y.tax_year_end
          AND ${HISTORY_AMOUNT_PLAUSIBLE_SQL}
        CROSS JOIN LATERAL (
          SELECT ${CLASS_HAY_SQL} AS hay,
                 ${LISTING_KIND_HAY_SQL} AS kind_hay
        ) fields
        WHERE l.town = ANY($1::text[])
          AND ${kindClause}
          AND ${classClause}
          AND ${TAX_AMOUNT_PLAUSIBLE_SQL}
     )
     SELECT town,
            count(*)::int AS sample_size,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY tax_amount) AS median_tax,
            avg(tax_amount) AS average_tax
       FROM eligible
      GROUP BY town
     UNION ALL
     SELECT 'All',
            count(*)::int,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY tax_amount),
            avg(tax_amount)
       FROM eligible`,
    [towns, taxYearEnds],
  )

  return rows.map((row) => ({
    town: row.town,
    sampleSize: int(row.sample_size),
    medianTax: num(row.median_tax),
    averageTax: num(row.average_tax),
  }))
}
