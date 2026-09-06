import 'server-only'

import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { readTownTaxAggregates } from '@/lib/db/town-tax-aggregates-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import {
  currentFiscalYearEnd,
  formatPulseTaxWindowLabel,
  pulseTaxCoverageIsReady,
  pulseTaxYearEnds,
} from '@/lib/listing-property-tax'
import type { MarketDigestTaxTownCount } from '@/lib/market-digest-types'
import { meanMinusMedian } from '@/lib/market-pulse-price-delta'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/**
 * Property tax median / average / delta per town.
 *
 * Same request-budget rule as closed-by-town: SQL at stats rebuild, page
 * and email only read. Pool is every listing × the last five fiscal years.
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
  /**
   * True only when the All-towns sample meets PULSE_TAX_YEAR_MIN_N.
   * Public readers hide the bars until this is true.
   */
  ready: boolean
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
  return `market-pulse-tax:${scope.kind}:${slice}:v3`
}

async function compute(
  scope: MarketPulseTaxScope,
): Promise<MarketPulseTaxPayload> {
  const taxYearEnds = pulseTaxYearEnds()
  const fiscalYearEnd = taxYearEnds[0] ?? currentFiscalYearEnd()
  const taxYearLabel = formatPulseTaxWindowLabel(taxYearEnds)
  const aggregates = await readTownTaxAggregates({
    towns: TMRE_TOWNS,
    taxYearEnds,
    kind: scope.kind,
    propertyClass: scope.propertyClass,
    commercialOnly: scope.commercialOnly,
  })

  const noun = scope.commercialOnly
    ? 'commercial listings'
    : scope.kind === 'rental'
      ? 'rentals'
      : 'listings'
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
        summary: `${row.sampleSize.toLocaleString()} ${noun}-year tax amounts in ${row.town} (${taxYearLabel}).`,
        detail: [
          `Median / mean of listing_tax_history (or MLS property_tax) for every listing, any status, across fiscal years ending ${taxYearEnds.join(', ')}.`,
          `One listing with five years is five observations (${classLabel}). Not each listing's own latest year only.`,
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          taxYearEnds: taxYearEnds.join(','),
          medianTax: row.medianTax,
          averageTax: row.averageTax,
          kind: scope.kind,
          propertyClass: scope.propertyClass ?? null,
          commercialOnly: scope.commercialOnly ?? false,
        },
      },
      averageTaxCalc: {
        summary: `Mean ${taxYearLabel} tax across ${row.sampleSize.toLocaleString()} ${noun}-year amounts in ${row.town}.`,
        detail: [
          'Same eligible pool as the median — every listing, last five fiscal years.',
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          taxYearEnds: taxYearEnds.join(','),
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
                'Average minus median on the same five-year listing tax pool. Not a year-over-year change.',
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

  const allSample =
    rows.find((row) => row.city.trim().toLowerCase() === 'all')?.sampleSize ?? 0
  const ready = pulseTaxCoverageIsReady(allSample)

  return {
    fiscalYearEnd,
    taxYearLabel,
    rows,
    ready,
    generatedAt: new Date().toISOString(),
  }
}

function emptyPayload(): MarketPulseTaxPayload {
  const taxYearEnds = pulseTaxYearEnds()
  const fiscalYearEnd = taxYearEnds[0] ?? currentFiscalYearEnd()
  return {
    fiscalYearEnd,
    taxYearLabel: formatPulseTaxWindowLabel(taxYearEnds),
    rows: [],
    ready: false,
    generatedAt: new Date().toISOString(),
  }
}

/** Page / email / town pulse: no rows until the All-towns sample is large enough. */
export function publicMarketPulseTaxPayload(
  payload: MarketPulseTaxPayload,
): MarketPulseTaxPayload {
  if (payload.ready) return payload
  return { ...payload, ready: false, rows: [] }
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
        return {
          payload: publicMarketPulseTaxPayload({
            ...parsed,
            ready:
              parsed.ready === true ||
              pulseTaxCoverageIsReady(
                parsed.rows.find((row) => row.city.trim().toLowerCase() === 'all')
                  ?.sampleSize,
              ),
          }),
          cached: true,
        }
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
    return {
      payload: publicMarketPulseTaxPayload(await computeAndCache(scope)),
      cached: false,
    }
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
