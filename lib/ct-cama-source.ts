/**
 * Connecticut Parcel & CAMA extracts + municipal mill rates, from data.ct.gov.
 *
 * Under CGS 7-100l every municipality files its parcel file and standardised
 * assessment (CAMA) data with its regional council of government, which passes
 * it to OPM, which republishes it as one Socrata dataset per collection year.
 * That is the assessor's own record of what each parcel was assessed at — the
 * same number the tax bill is computed from — available in bulk instead of one
 * parcel page at a time.
 *
 * Tax itself is not in these extracts. CT bills are
 * `assessment / 1000 * mill rate`, where the mill rate for a fiscal year is set
 * against the grand list from two years earlier, so the second dataset here is
 * the OPM mill rate table.
 *
 * Everything in this module is pure fetch + shape work with no database and no
 * `server-only`, so the sync can be exercised end to end from a CLI dry run.
 */

const SOCRATA_HOST = 'https://data.ct.gov'
const USER_AGENT = 'tmre-website/0.1 (+https://tmrebuilder.com; ct-cama-sync)'
const PAGE_SIZE = 25_000
const REQUEST_TIMEOUT_MS = 90_000
const RETRY_DELAYS_MS = [2_000, 6_000, 15_000]

/** OPM mill rate table, all municipalities and districts, FY2014 onward. */
const MILL_RATE_DATASET = 'emyx-j53e'

/**
 * Socrata column names drifted between vintages: 2023 was published with the
 * underscores stripped (`assessedtotal`), the others keep them. Same data, so
 * the reader adapts rather than the caller caring.
 */
type CamaColumns = {
  pid: string
  accountNumber: string
  location: string
  propertyCity: string
  valuationYear: string
  assessedTotal: string
  stateUseDescription: string
}

const SNAKE_COLUMNS: CamaColumns = {
  pid: 'pid',
  accountNumber: 'account_number',
  location: 'location',
  propertyCity: 'property_city',
  valuationYear: 'valuation_year',
  assessedTotal: 'assessed_total',
  stateUseDescription: 'state_use_description',
}

const SMASHED_COLUMNS: CamaColumns = {
  pid: 'pid',
  accountNumber: 'accountnumber',
  location: 'location',
  propertyCity: 'propertycity',
  valuationYear: 'valuationyear',
  assessedTotal: 'assessedtotal',
  stateUseDescription: 'stateusedescription',
}

export type CamaVintage = {
  /** Collection year OPM published the extract under. */
  vintage: number
  datasetId: string
  columns: CamaColumns
}

/**
 * Newest first — the timeline builder prefers the freshest observation of a
 * given grand list year.
 *
 * All seven coverage towns file in all four collections, so the vintages differ
 * by which grand list year each town's file describes, not by who is present.
 * Measured against these datasets, one town can repeat the same grand list year
 * in every collection (Westport files 2021 four times) while another advances
 * each time (New Canaan: 2022, 2023, 2024, 2025). Reading several vintages is
 * what turns that into a usable series.
 */
export const CAMA_VINTAGES: readonly CamaVintage[] = [
  { vintage: 2025, datasetId: 'rny9-6ak2', columns: SNAKE_COLUMNS },
  { vintage: 2024, datasetId: 'pqrn-qghw', columns: SNAKE_COLUMNS },
  { vintage: 2023, datasetId: 'ezgm-i4uu', columns: SMASHED_COLUMNS },
  { vintage: 2022, datasetId: 'i7xw-titi', columns: SNAKE_COLUMNS },
]

/**
 * Towns whose published town-proper mill rate cannot be applied to a parcel.
 *
 * Norwalk levies through six numbered taxing districts (1st Downtown, 6th
 * Rowayton, and so on) plus special services districts, each with its own rate;
 * the `municipality = 'Norwalk'` row in the OPM table is not one of them and
 * reads 0 for FY2023-24 and a suspiciously round 28/32 for FY2025-26. Applying
 * it would produce confidently wrong numbers for the largest town in coverage,
 * so Norwalk is skipped until a parcel-to-district mapping exists. The district
 * rates themselves are in the dataset and are sane, so the unlock is the
 * mapping, not the rates.
 */
export const MILL_RATE_MULTI_DISTRICT_TOWNS: Readonly<Record<string, string>> = {
  Norwalk:
    'Norwalk bills through six numbered taxing districts with separate mill rates; the town-proper OPM row is not applicable to a parcel.',
}

/** Rates outside this band are treated as unpublished rather than real. */
const MILL_RATE_MIN = 1
const MILL_RATE_MAX = 100

export type MillRateRow = {
  town: string
  fiscalYearEnd: number
  grandListYear: number
  millRate: number
}

export type CamaParcel = {
  town: string
  /** Collection year this row was read from. */
  vintage: number
  /**
   * The assessor's own parcel id.
   *
   * Stable across vintages only where the town runs Vision, in which case it is
   * the same value as `vision_pid` (verified against Westport). Elsewhere the
   * key space changes between filings — New Canaan switched from map-block-lot
   * strings to sequential integers, Wilton renumbered outright — so this cannot
   * be assumed to identify a parcel over time.
   */
  pid: string | null
  accountNumber: string | null
  /** Street line as the assessor writes it, e.g. `2 ACORN LN`. */
  location: string | null
  grandListYear: number | null
  assessedTotal: number | null
  useDescription: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Socrata numbers arrive as float-ish strings (`"1907.0"`, `"940800.0"`). */
function toNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function toInt(value: unknown): number | null {
  const n = toNumber(value)
  return n == null ? null : Math.round(n)
}

function toText(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

/** `"1907.0"` and `"1907"` are the same parcel in different vintages. */
export function normalizeCamaPid(value: unknown): string | null {
  const n = toInt(value)
  if (n != null && n > 0) return String(n)
  return toText(value)
}

async function fetchSocrataPage(
  datasetId: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const search = new URLSearchParams(params)
  const url = `${SOCRATA_HOST}/resource/${datasetId}.json?${search.toString()}`
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
  }
  // Anonymous requests share a throttling pool. A token lifts the limit but is
  // not required, so the sync works without any credential configured.
  const appToken = process.env.CT_OPEN_DATA_APP_TOKEN?.trim()
  if (appToken) headers['X-App-Token'] = appToken

  let lastError: unknown = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!)
    try {
      const res = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status} for ${datasetId}`)
        continue
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${datasetId}: ${await res.text()}`)
      }
      return (await res.json()) as Record<string, unknown>[]
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(
    `data.ct.gov request failed for ${datasetId}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

async function fetchSocrataAll(
  datasetId: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchSocrataPage(datasetId, {
      ...params,
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    })
    out.push(...page)
    if (page.length < PAGE_SIZE) return out
  }
}

/** True when this town's published town-proper rate is usable per parcel. */
export function millRateTownIsSupported(town: string): boolean {
  return !(town in MILL_RATE_MULTI_DISTRICT_TOWNS)
}

export function millRateTownSkipReason(town: string): string | null {
  return MILL_RATE_MULTI_DISTRICT_TOWNS[town] ?? null
}

/**
 * Town-proper real-property mill rates, keyed town -> fiscal year end.
 *
 * Districts and boroughs are filtered out by requiring an exact municipality
 * match: the dataset names them `Westport - Lansdowne Tax Dist`, so a `like`
 * would fold roughly twenty separate levies into the town's own rate.
 */
export async function fetchMillRates(
  towns: readonly string[],
): Promise<MillRateRow[]> {
  const supported = towns.filter(millRateTownIsSupported)
  if (supported.length === 0) return []

  const quoted = supported.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')
  const rows = await fetchSocrataAll(MILL_RATE_DATASET, {
    $select: 'municipality,fiscal_year,grand_list_year,mill_rate_real_personal',
    $where: `municipality in (${quoted})`,
  })

  const out: MillRateRow[] = []
  for (const row of rows) {
    const town = toText(row.municipality)
    const fiscalYearEnd = toInt(row.fiscal_year)
    const millRate = toNumber(row.mill_rate_real_personal)
    if (!town || fiscalYearEnd == null || millRate == null) continue
    if (millRate < MILL_RATE_MIN || millRate > MILL_RATE_MAX) continue
    out.push({
      town,
      fiscalYearEnd,
      grandListYear: toInt(row.grand_list_year) ?? grandListYearFor(fiscalYearEnd),
      millRate,
    })
  }
  return out
}

/** Mill rates indexed for lookup, newest fiscal year first within a town. */
export function indexMillRates(
  rows: readonly MillRateRow[],
): Map<string, Map<number, number>> {
  const byTown = new Map<string, Map<number, number>>()
  for (const row of rows) {
    let years = byTown.get(row.town)
    if (!years) {
      years = new Map<number, number>()
      byTown.set(row.town, years)
    }
    years.set(row.fiscalYearEnd, row.millRate)
  }
  return byTown
}

/** One town's parcels from one CAMA vintage. */
export async function fetchCamaParcels(
  vintage: CamaVintage,
  town: string,
): Promise<CamaParcel[]> {
  const c = vintage.columns
  const escaped = town.replace(/'/g, "''").toUpperCase()
  const rows = await fetchSocrataAll(vintage.datasetId, {
    $select: [
      c.pid,
      c.accountNumber,
      c.location,
      c.valuationYear,
      c.assessedTotal,
      c.stateUseDescription,
    ].join(','),
    $where: `upper(${c.propertyCity})='${escaped}'`,
  })

  return rows.map((row) => ({
    town,
    vintage: vintage.vintage,
    pid: normalizeCamaPid(row[c.pid]),
    accountNumber: normalizeCamaPid(row[c.accountNumber]),
    location: toText(row[c.location]),
    grandListYear: toInt(row[c.valuationYear]),
    assessedTotal: toInt(row[c.assessedTotal]),
    useDescription: toText(row[c.stateUseDescription]),
  }))
}

/**
 * CT fiscal years run July-June and are named for the ending calendar year, so
 * FY2027 is July 2026 - June 2027. OPM sets each year's mill rate against the
 * grand list from two Octobers earlier: FY2027 bills the 1 October 2025 list.
 */
export function grandListYearFor(fiscalYearEnd: number): number {
  return fiscalYearEnd - 2
}

export function fiscalYearEndFor(grandListYear: number): number {
  return grandListYear + 2
}
