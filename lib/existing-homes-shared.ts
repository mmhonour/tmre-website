/**
 * Client-safe NAR existing-home catalog for /trends.
 * Closings / inventory / supply / prices come from FRED (NAR release).
 * Pending Home Sales is NAR-only — not on FRED.
 */

export type ExistingHomesSeriesId =
  | 'EXHOSLUSM495S'
  | 'HOSINVUSM495N'
  | 'HOSSUPUSM673N'
  | 'HOSMEDUSM052N'
  | 'EXHOSLUSNEM495S'
  | 'HOSMEDUSNEM052N'

export type ExistingHomesRegion = 'us' | 'northeast'

export type ExistingHomesUnit =
  | 'units-saar'
  | 'units'
  | 'months'
  | 'dollars'

export type ExistingHomesObservation = {
  date: string
  value: number
}

export type ExistingHomesSeriesMeta = {
  id: ExistingHomesSeriesId
  label: string
  description: string
  source: 'NAR via FRED'
  region: ExistingHomesRegion
  unit: ExistingHomesUnit
}

export type ExistingHomesSeriesData = {
  seriesId: ExistingHomesSeriesId
  observations: ExistingHomesObservation[]
  latest: ExistingHomesObservation | null
  priorMonth: ExistingHomesObservation | null
  yearAgo: ExistingHomesObservation | null
}

export const NAR_EXISTING_HOME_SALES_URL =
  'https://www.nar.realtor/research-and-statistics/housing-statistics/existing-home-sales'

export const NAR_PENDING_HOME_SALES_URL =
  'https://www.nar.realtor/research-and-statistics/housing-statistics/pending-home-sales'

export const FRED_NAR_RELEASE_URL = 'https://fred.stlouisfed.org/release?rid=291'

export function fredHousingSeriesUrl(seriesId: ExistingHomesSeriesId): string {
  return `https://fred.stlouisfed.org/series/${seriesId}`
}

export const EXISTING_HOMES_SERIES: readonly ExistingHomesSeriesMeta[] = [
  {
    id: 'EXHOSLUSM495S',
    label: 'Existing-home sales',
    description:
      'Seasonally adjusted annual rate of existing single-family, condo, and co-op closings.',
    source: 'NAR via FRED',
    region: 'us',
    unit: 'units-saar',
  },
  {
    id: 'HOSINVUSM495N',
    label: 'Existing-home inventory',
    description:
      'Homes listed as active or pending — the unsold existing-home stock.',
    source: 'NAR via FRED',
    region: 'us',
    unit: 'units',
  },
  {
    id: 'HOSSUPUSM673N',
    label: 'Months of supply',
    description:
      'How long the current existing-home inventory would last at the prevailing sales pace.',
    source: 'NAR via FRED',
    region: 'us',
    unit: 'months',
  },
  {
    id: 'HOSMEDUSM052N',
    label: 'Median existing-home price',
    description: 'National median closing price for existing homes.',
    source: 'NAR via FRED',
    region: 'us',
    unit: 'dollars',
  },
  {
    id: 'EXHOSLUSNEM495S',
    label: 'Northeast sales',
    description:
      'Existing-home sales (SAAR) for the Northeast census region — same NAR report as the national print.',
    source: 'NAR via FRED',
    region: 'northeast',
    unit: 'units-saar',
  },
  {
    id: 'HOSMEDUSNEM052N',
    label: 'Northeast median price',
    description:
      'Median existing-home price for the Northeast census region — same NAR report as the national print.',
    source: 'NAR via FRED',
    region: 'northeast',
    unit: 'dollars',
  },
]

export const EXISTING_HOMES_SERIES_BY_ID: Record<
  ExistingHomesSeriesId,
  ExistingHomesSeriesMeta
> = Object.fromEntries(EXISTING_HOMES_SERIES.map((row) => [row.id, row])) as Record<
  ExistingHomesSeriesId,
  ExistingHomesSeriesMeta
>

export const EXISTING_HOMES_US_SERIES = EXISTING_HOMES_SERIES.filter(
  (row) => row.region === 'us',
)

export const EXISTING_HOMES_NORTHEAST_SERIES = EXISTING_HOMES_SERIES.filter(
  (row) => row.region === 'northeast',
)

/** FRED has shown both thousands and raw unit counts for NAR housing series. */
export function housingUnitsToCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return value
  if (value >= 10_000) return value
  return value * 1_000
}

export function formatHousingMillion(value: number): string {
  const units = housingUnitsToCount(value)
  return `${(units / 1_000_000).toFixed(2)} million`
}

export function formatHousingMonths(value: number): string {
  return `${value.toFixed(1)} mo`
}

export function formatHousingUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatExistingHomesValue(
  value: number,
  unit: ExistingHomesUnit,
): string {
  switch (unit) {
    case 'units-saar':
    case 'units':
      return formatHousingMillion(value)
    case 'months':
      return formatHousingMonths(value)
    case 'dollars':
      return formatHousingUsd(value)
  }
}

export function formatObsMonth(iso: string): string {
  const ms = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(ms)) return iso.slice(0, 7)
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatObsMonthShort(iso: string): string {
  const ms = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(ms)) return iso.slice(0, 7)
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null
  }
  return ((current - previous) / previous) * 100
}

export function formatPctChange(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value).toFixed(1)
  if (value > 0) return `+${abs}%`
  if (value < 0) return `−${abs}%`
  return '0.0%'
}

export type NarPendingSnapshot = {
  index: number | null
  asOfLabel: string | null
  momPct: number | null
  yoyPct: number | null
  northeastIndex: number | null
  nextRelease: string | null
  sourceUrl: typeof NAR_PENDING_HOME_SALES_URL
  fetchedAt: string
  parseOk: boolean
  error?: string
}
