import 'server-only'

import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { getSyncMeta } from '@/lib/db/sync-meta'
import {
  readPulseTaxListingUniverse,
  readPulseTaxYearCoverage,
  readTownTaxAggregates,
} from '@/lib/db/town-tax-aggregates-repo'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import {
  currentFiscalYearEnd,
  decidePulseTaxYear,
  formatPulseTaxComparedLabel,
  type PulseTaxYearDecision,
  type PulseTaxYearKind,
} from '@/lib/listing-property-tax'
import type { MarketDigestTaxTownCount } from '@/lib/market-digest-types'
import { meanMinusMedian } from '@/lib/market-pulse-price-delta'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/**
 * Property tax median / average / delta per town.
 *
 * Same request-budget rule as closed-by-town: SQL at stats rebuild, page
 * and email only read. One fiscal year — current once 80% of the book has
 * it, otherwise prior. Bars stay off until CAMA has run and that year
 * has quorum.
 */

export type MarketPulseTaxScope = {
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}

export type MarketPulseTaxCoverage = PulseTaxYearDecision & {
  currentYearEnd: number
  priorYearEnd: number
  camaSyncedAt: string | null
}

export type MarketPulseTaxPayload = {
  fiscalYearEnd: number
  taxYearLabel: string
  yearKind: PulseTaxYearKind
  coverage: MarketPulseTaxCoverage
  rows: MarketDigestTaxTownCount[]
  /**
   * True only when CAMA has finished once and the chosen FY has 80%
   * coverage. Public readers hide the bars until this is true.
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
  return `market-pulse-tax:${scope.kind}:${slice}:v4`
}

async function measureCoverage(
  scope: MarketPulseTaxScope,
): Promise<MarketPulseTaxCoverage> {
  const currentYearEnd = currentFiscalYearEnd()
  const priorYearEnd = currentYearEnd - 1
  const [listingUniverse, yearCounts, camaSyncedAt] = await Promise.all([
    readPulseTaxListingUniverse({
      towns: TMRE_TOWNS,
      kind: scope.kind,
      propertyClass: scope.propertyClass,
      commercialOnly: scope.commercialOnly,
    }),
    readPulseTaxYearCoverage({
      towns: TMRE_TOWNS,
      yearEnds: [currentYearEnd, priorYearEnd],
      kind: scope.kind,
      propertyClass: scope.propertyClass,
      commercialOnly: scope.commercialOnly,
    }),
    getSyncMeta('cama_tax_history_synced_at'),
  ])
  const countCurrent =
    yearCounts.find((row) => row.taxYearEnd === currentYearEnd)?.listingCount ??
    0
  const countPrior =
    yearCounts.find((row) => row.taxYearEnd === priorYearEnd)?.listingCount ?? 0
  const decision = decidePulseTaxYear({
    currentYearEnd,
    listingUniverse,
    countCurrent,
    countPrior,
    camaHasRun: Boolean(camaSyncedAt?.trim()),
  })
  return {
    ...decision,
    currentYearEnd,
    priorYearEnd,
    camaSyncedAt: camaSyncedAt?.trim() || null,
  }
}

function emptyCoverage(): MarketPulseTaxCoverage {
  const currentYearEnd = currentFiscalYearEnd()
  const decision = decidePulseTaxYear({
    currentYearEnd,
    listingUniverse: 0,
    countCurrent: 0,
    countPrior: 0,
    camaHasRun: false,
  })
  return {
    ...decision,
    currentYearEnd,
    priorYearEnd: currentYearEnd - 1,
    camaSyncedAt: null,
  }
}

async function compute(
  scope: MarketPulseTaxScope,
): Promise<MarketPulseTaxPayload> {
  const coverage = await measureCoverage(scope)
  const fiscalYearEnd = coverage.yearEnd
  const taxYearLabel = formatPulseTaxComparedLabel(fiscalYearEnd, coverage.kind)
  const aggregates = coverage.ready
    ? await readTownTaxAggregates({
        towns: TMRE_TOWNS,
        taxYearEnds: [fiscalYearEnd],
        kind: scope.kind,
        propertyClass: scope.propertyClass,
        commercialOnly: scope.commercialOnly,
      })
    : []

  const noun = scope.commercialOnly
    ? 'commercial listings'
    : scope.kind === 'rental'
      ? 'rentals'
      : 'listings'
  const classLabel = scope.commercialOnly
    ? 'commercial'
    : (scope.propertyClass ?? 'all')
  const yearWord = coverage.kind === 'current' ? 'current' : 'prior'

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
          `Median / mean of listing_tax_history (or MLS property_tax) for every listing, any status, for the ${yearWord} fiscal year (${classLabel}).`,
          'Current year is used only after 80% of the listing book has that bill. CAMA fills prior years.',
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          yearKind: coverage.kind,
          pctCurrent: coverage.pctCurrent,
          pctPrior: coverage.pctPrior,
          listingUniverse: coverage.listingUniverse,
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
          'Same eligible pool as the median — one fiscal year, every listing in scope.',
        ],
        inputs: {
          city: row.town,
          sampleSize: row.sampleSize,
          fiscalYearEnd,
          yearKind: coverage.kind,
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
                'Average minus median on the same single-year listing tax pool. Not a year-over-year change.',
              ],
              inputs: {
                city: row.town,
                taxDelta: delta.dollars,
                taxDeltaPct: delta.pct,
                fiscalYearEnd,
                yearKind: coverage.kind,
              },
            }
          : undefined,
    }
  })

  return {
    fiscalYearEnd,
    taxYearLabel,
    yearKind: coverage.kind,
    coverage,
    rows,
    ready: coverage.ready,
    generatedAt: new Date().toISOString(),
  }
}

function emptyPayload(): MarketPulseTaxPayload {
  const coverage = emptyCoverage()
  return {
    fiscalYearEnd: coverage.yearEnd,
    taxYearLabel: formatPulseTaxComparedLabel(coverage.yearEnd, coverage.kind),
    yearKind: coverage.kind,
    coverage,
    rows: [],
    ready: false,
    generatedAt: new Date().toISOString(),
  }
}

/** Page / email / town pulse: no rows until CAMA quorum is cached. */
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
            ready: parsed.ready === true,
            yearKind: parsed.yearKind ?? 'prior',
            taxYearLabel:
              parsed.taxYearLabel ??
              formatPulseTaxComparedLabel(
                parsed.fiscalYearEnd,
                parsed.yearKind ?? 'prior',
              ),
            coverage: parsed.coverage ?? emptyCoverage(),
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
      if (payload.rows.length > 0 || payload.ready) written += 1
    } catch (err) {
      console.warn(
        `[market-pulse-tax] rebuild failed for ${cacheKey(scope)}`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { written }
}

export type PulseTaxQuorumAdmin = {
  live: MarketPulseTaxCoverage
  cached: {
    ready: boolean
    yearKind: PulseTaxYearKind
    taxYearLabel: string
    generatedAt: string | null
  }
}

/** Live CAMA/MLS coverage vs what the last stats rebuild published. */
export async function readPulseTaxQuorumAdmin(): Promise<PulseTaxQuorumAdmin> {
  const scope: MarketPulseTaxScope = { kind: 'sale', propertyClass: 'all' }
  const [live, cached] = await Promise.all([
    measureCoverage(scope),
    readMarketPulseTaxByTown(scope, { allowCompute: false }),
  ])
  return {
    live,
    cached: {
      ready: cached.payload.ready,
      yearKind: cached.payload.yearKind,
      taxYearLabel: cached.payload.taxYearLabel,
      generatedAt: cached.cached ? cached.payload.generatedAt : null,
    },
  }
}
