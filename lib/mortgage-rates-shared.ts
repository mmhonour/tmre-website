/**
 * Client-safe mortgage rate series catalog + loan-limit types for
 * /mortgage-rates. Server sync lives in lib/mortgage-rates-sync.ts.
 */

export type MortgageSeriesId =
  | 'MORTGAGE30US'
  | 'MORTGAGE15US'
  | 'OBMMIC30YF'
  | 'OBMMIJUMBO30YF'
  | 'DGS30'
  | 'DGS15'
  | 'DGS10'
  | 'DGS5'

export type MortgageSeriesMeta = {
  id: MortgageSeriesId
  /** Short label for cards and chart legends. */
  label: string
  /** What the number actually measures (shown as help text). */
  description: string
  /** Publisher shown next to the value so nothing looks like a TMRE quote. */
  source: string
  /** How often the publisher updates the series. */
  cadence: 'weekly' | 'daily'
}

/**
 * Freddie Mac PMMS only publishes live national averages for 30-yr and 15-yr
 * fixed. There is no live MORTGAGE10US; MORTGAGE5US (5/1 ARM) was discontinued
 * Nov 2022. Pair mortgages with Treasury CMT yields (DGS*) of matching tenor.
 */
export const MORTGAGE_SERIES: readonly MortgageSeriesMeta[] = [
  {
    id: 'MORTGAGE30US',
    label: '30-yr fixed',
    description:
      'Freddie Mac Primary Mortgage Market Survey — national average rate for a 30-year fixed conforming loan.',
    source: 'Freddie Mac PMMS via FRED',
    cadence: 'weekly',
  },
  {
    id: 'MORTGAGE15US',
    label: '15-yr fixed',
    description:
      'Freddie Mac Primary Mortgage Market Survey — national average rate for a 15-year fixed conforming loan.',
    source: 'Freddie Mac PMMS via FRED',
    cadence: 'weekly',
  },
  {
    id: 'OBMMIC30YF',
    label: '30-yr conforming',
    description:
      'Optimal Blue Mortgage Market Index — rate locks on 30-year fixed loans at or under the conforming limit.',
    source: 'Optimal Blue via FRED',
    cadence: 'daily',
  },
  {
    id: 'OBMMIJUMBO30YF',
    label: '30-yr jumbo',
    description:
      'Optimal Blue Mortgage Market Index — rate locks on 30-year fixed loans above the conforming limit.',
    source: 'Optimal Blue via FRED',
    cadence: 'daily',
  },
  {
    id: 'DGS30',
    label: '30-yr Treasury',
    description:
      'Constant-maturity 30-year Treasury yield (H.15) — the long-bond benchmark that pairs with 30-year fixed mortgages.',
    source: 'U.S. Treasury CMT via FRED',
    cadence: 'daily',
  },
  {
    id: 'DGS15',
    label: '15-yr Treasury',
    description:
      'Constant-maturity 15-year Treasury yield (H.15) — pairs with 15-year fixed mortgages.',
    source: 'U.S. Treasury CMT via FRED',
    cadence: 'daily',
  },
  {
    id: 'DGS10',
    label: '10-yr Treasury',
    description:
      'Constant-maturity 10-year Treasury yield (H.15) — the tenor mortgage pricing tracks most closely day to day (no live national 10-yr mortgage average on FRED).',
    source: 'U.S. Treasury CMT via FRED',
    cadence: 'daily',
  },
  {
    id: 'DGS5',
    label: '5-yr Treasury',
    description:
      'Constant-maturity 5-year Treasury yield (H.15) — short/intermediate benchmark (Freddie’s 5/1 ARM survey was discontinued Nov 2022).',
    source: 'U.S. Treasury CMT via FRED',
    cadence: 'daily',
  },
]

export const MORTGAGE_SERIES_BY_ID: Record<
  MortgageSeriesId,
  MortgageSeriesMeta
> = MORTGAGE_SERIES.reduce(
  (acc, meta) => {
    acc[meta.id] = meta
    return acc
  },
  {} as Record<MortgageSeriesId, MortgageSeriesMeta>,
)

/** Headline cards at the top of the page, in display order. */
export const MORTGAGE_HEADLINE_SERIES: readonly MortgageSeriesId[] = [
  'MORTGAGE30US',
  'MORTGAGE15US',
  'OBMMIJUMBO30YF',
]

/**
 * On-the-run–equivalent Treasury constant maturities (H.15 / DGS*).
 * Shown as the duration stack opposite live mortgage tenors.
 */
export const MORTGAGE_TREASURY_SERIES: readonly MortgageSeriesId[] = [
  'DGS30',
  'DGS15',
  'DGS10',
  'DGS5',
]

/** Series drawn on the jumbo-vs-conforming chart. */
export const MORTGAGE_SPREAD_SERIES: readonly MortgageSeriesId[] = [
  'OBMMIC30YF',
  'OBMMIJUMBO30YF',
]

export type MortgageObservation = {
  /** YYYY-MM-DD */
  date: string
  value: number
}

export type MortgageSeriesData = {
  seriesId: MortgageSeriesId
  observations: MortgageObservation[]
  latest: MortgageObservation | null
  /** Observation roughly a year before `latest`, for the YoY delta. */
  yearAgo: MortgageObservation | null
}

export function isMortgageSeriesId(raw: string): raw is MortgageSeriesId {
  return raw in MORTGAGE_SERIES_BY_ID
}

export function formatRatePct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(2)}%`
}

/** Signed percentage-point delta, e.g. "+0.34 pts" / "−0.12 pts". */
export function formatRateDelta(
  from: number | null | undefined,
  to: number | null | undefined,
): string | null {
  if (from == null || to == null) return null
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const delta = to - from
  if (Math.abs(delta) < 0.005) return 'flat'
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(2)} pts`
}

/** Jumbo minus conforming, in percentage points (negative = jumbo cheaper). */
export function jumboConformingSpread(
  conforming: number | null | undefined,
  jumbo: number | null | undefined,
): number | null {
  if (conforming == null || jumbo == null) return null
  if (!Number.isFinite(conforming) || !Number.isFinite(jumbo)) return null
  return jumbo - conforming
}

export function describeJumboSpread(spread: number | null): string {
  if (spread == null) return 'Spread unavailable until both series sync.'
  if (Math.abs(spread) < 0.05) {
    return 'Jumbo and conforming are priced about the same right now.'
  }
  const pts = `${Math.abs(spread).toFixed(2)} pts`
  return spread > 0
    ? `Jumbo is pricing ${pts} above conforming.`
    : `Jumbo is pricing ${pts} below conforming — common when banks want jumbo borrowers on their own balance sheet.`
}

// ---------------------------------------------------------------------------
// Conforming loan limits — Admin-editable so FHFA's annual update never needs
// a code push. Defaults are the FHFA baseline/ceiling; verify against the
// official table before relying on any county row.
// ---------------------------------------------------------------------------

export const FHFA_LOAN_LIMITS_URL =
  'https://www.fhfa.gov/data/conforming-loan-limit'

export type ConformingCountyLimit = {
  id: string
  label: string
  /** One-unit limit in dollars. */
  oneUnit: number
  note: string
}

export type ConformingLoanLimits = {
  /** Limit year these figures apply to. */
  year: number
  /** FHFA baseline one-unit limit for most of the country. */
  baselineOneUnit: number
  /** FHFA high-cost ceiling (150% of baseline). */
  highCostCeiling: number
  counties: ConformingCountyLimit[]
}

export const DEFAULT_CONFORMING_LIMITS: ConformingLoanLimits = {
  year: 2025,
  baselineOneUnit: 806_500,
  highCostCeiling: 1_209_750,
  counties: [
    {
      id: 'fairfield',
      label: 'Fairfield County, CT',
      oneUnit: 806_500,
      note: 'Verify against the FHFA county table each year — high-cost designations change.',
    },
  ],
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${Math.round(value).toLocaleString('en-US')}`
}
