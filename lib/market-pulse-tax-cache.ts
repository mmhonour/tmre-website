import 'server-only'

import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import {
  readPulseTaxYearCoverage,
  readTownTaxAggregates,
} from '@/lib/db/town-tax-aggregates-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import {
  choosePulseTaxYearEnd,
  currentFiscalYearEnd,
  formatTaxYearLabel,
} from '@/lib/listing-property-tax'
import type { MarketDigestTaxTownCount } from '@/lib/market-digest-types'
import { meanMinusMedian } from '@/lib/market-pulse-price-delta'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/**
 * Current-year property tax median / average / delta per town.
 *
 * Same request-budget rule as closed-by-town: SQL at stats rebuild, page
 * and email only read. Listings missing the in-play fiscal year are out.
 */

export type MarketPulseTaxScope = {
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}

export type MarketPulseTaxPayload = {
  fiscalYearEnd: number
  taxYearLabel: string
  rows: MarketDigestTaxTownCount[]
  generatedAt: string
}

export const MARKET_PULSE_TAX_SCOPES: readonly MarketPulseTaxScope[] = [
  { kind: 'sale', propertyClass: 'all' },
  { kind: 'sale', propertyClass: 'homes' },
  { kind: 'sale', propertyClass: 'condos' },
  { kind: 'rental', propertyClass: 'all' },
  { kind: 'sale', commercialOnly: true },
]

function cacheKey(scope: MarketPulseTaxScope): string {
  const slice = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  return `market-pulse-tax:${scope.kind}:${slice}:v1`
}

async function resolveInPlayTaxYearEnd(): Promise<number> {
  const current = currentFiscalYearEnd()
  const coverage = await readPulseTaxYearCoverage({
    towns: TMRE_TOWNS,
    yearEnds: [current, current - 1],
  })
  const countCurrent =
    coverage.find((row) => row.taxYearEnd === current)?.listingCount ?? 0
  const countPrior =
    coverage.find((row) => row.taxYearEnd === current - 1)?.listingCount ?? 0
  return choosePulseTaxYearEnd(current, countCurrent, countPrior)
}

async function compute(
  scope: MarketPulseTaxScope,
): Promise<MarketPulseTaxPayload> {
  const fiscalYearEnd = await resolveInPlayTaxYearEnd()
  const taxYearLabel = formatTaxYearLabel(fiscalYearEnd)
  const aggregates = await readTownTaxAggregates({
    towns: TMRE_TOWNS,
    taxYearEnd: fiscalYearEnd,
    kind: scope.kind,
    propertyClass: scope.propertyClass,
    commercialOnly: scope.commercialOnly,
  })

  const noun = scope.commercialOnly
    ? 'active commercial listings'
    : scope.kind === 'rental'
      ? 'active rentals'
      : 'active listings'
  const classLabel = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')

  const rows: MarketDigestTaxTownCount[] = aggregates.map((row) => {
    const delta = meanMinusMedian(row.averageTax, row.medianTax)
    return {
      city: row.town,
      medianTax: row.medianTax,
      averageTax: row.averageTax,
      taxDelta: delta.dollars,
      taxDeltaPct: delta.pct,
      sampleSize: row.sampleSize,
      fiscalYearEnd,
      taxYearLabel,
      medianTaxCalc: {
        summary: `${row.sampleSize.toLocaleString()} ${noun} in ${row.town} with ${taxYearLabel} tax.`,
        detail: [
          `Median / mean of listing_tax_history (or MLS property_tax) for fiscal year ending ${fiscalYearEnd}.`,
          `Listings without that year are excluded — not each listing's own latest year (${classLabel}).`,
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          medianTax: row.medianTax,
          averageTax: row.averageTax,
          kind: scope.kind,
          propertyClass: scope.propertyClass ?? null,
          commercialOnly: scope.commercialOnly ?? false,
        },
      },
      averageTaxCalc: {
        summary: `Mean ${taxYearLabel} tax across ${row.sampleSize.toLocaleString()} ${noun} in ${row.town}.`,
        detail: [
          `Same eligible pool as the median — Active listings with fiscal year ending ${fiscalYearEnd} only.`,
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          averageTax: row.averageTax,
        },
      },
      taxDeltaCalc:
        delta.dollars != null
          ? {
              summary: `Average ${taxYearLabel} tax in ${row.town} runs ${
                delta.pct != null
                  ? `${delta.pct >= 0 ? '' : '−'}${Math.abs(delta.pct).toFixed(1)}%`
                  : '—'
              } ${delta.dollars >= 0 ? 'above' : 'below'} the median.`,
              detail: [
                'Average minus median on the same current-year tax pool. Not a year-over-year change.',
              ],
              inputs: {
                city: row.town,
                taxDelta: delta.dollars,
                taxDeltaPct: delta.pct,
                fiscalYearEnd,
              },
            }
          : undefined,
    }
  })

  return {
    fiscalYearEnd,
    taxYearLabel,
    rows,
    generatedAt: new Date().toISOString(),
  }
}

function emptyPayload(): MarketPulseTaxPayload {
  const fiscalYearEnd = currentFiscalYearEnd()
  return {
    fiscalYearEnd,
    taxYearLabel: formatTaxYearLabel(fiscalYearEnd),
    rows: [],
    generatedAt: new Date().toISOString(),
  }
}

async function computeAndCache(
  scope: MarketPulseTaxScope,
): Promise<MarketPulseTaxPayload> {
  const payload = await compute(scope)
  try {
    await writeStatsCacheRow(cacheKey(scope), payload)
  } catch (err) {
    console.warn(
      '[market-pulse-tax] cache write failed',
      err instanceof Error ? err.message : err,
    )
  }
  return payload
}

export async function readMarketPulseTaxByTown(
  scope: MarketPulseTaxScope,
  options: { allowCompute?: boolean } = {},
): Promise<{
  payload: MarketPulseTaxPayload
  cached: boolean
}> {
  const allowCompute = options.allowCompute ?? false
  try {
    const row = await readStatsCacheRow(cacheKey(scope))
    if (row?.payload) {
      const parsed = JSON.parse(row.payload) as MarketPulseTaxPayload
      if (Array.isArray(parsed.rows)) {
        return { payload: parsed, cached: true }
      }
    }
  } catch (err) {
    console.warn(
      '[market-pulse-tax] cache read failed',
      err instanceof Error ? err.message : err,
    )
  }

  if (!allowCompute) {
    return { payload: emptyPayload(), cached: false }
  }

  try {
    return { payload: await computeAndCache(scope), cached: false }
  } catch (err) {
    console.warn(
      '[market-pulse-tax] compute failed',
      err instanceof Error ? err.message : err,
    )
    return { payload: emptyPayload(), cached: false }
  }
}

export async function rebuildMarketPulseTaxCache(): Promise<{
  written: number
}> {
  let written = 0
  for (const scope of MARKET_PULSE_TAX_SCOPES) {
    try {
      const payload = await computeAndCache(scope)
      if (payload.rows.length > 0) written += 1
    } catch (err) {
      console.warn(
        `[market-pulse-tax] rebuild failed for ${cacheKey(scope)}`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { written }
}
