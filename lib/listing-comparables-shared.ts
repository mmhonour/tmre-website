import { VINTAGE_BUCKETS, type VintageBucketId } from '@/lib/vintage-buckets'

export type ComparableListing = {
  mlsId: string
  listingKey: string
  address: string
  city: string | null
  zip: string | null
  price: number | null
  closePrice: number | null
  closeDate: string | null
  beds: number | null
  baths: number | null
  lotAcres: number | null
  sqft: number | null
  vintageBucket: VintageBucketId
  vintageLabel: string
  yearBuilt: number | null
  pricePerSqft: number | null
  dom: number | null
  photoCount: number | null
  latitude: number | null
  longitude: number | null
  /** Location premium multiplier (water, center, golf) for If weighting. */
  locationPremiumMultiplier: number
  /** Goldilocks composite (0–100), same model as Intelligence. */
  goldilocksScore?: number | null
  /** Weekly metadata edge score (0–100), comparable across listings. */
  edgeScore?: number | null
  /**
   * Compact MLS timeline (UAG rows). Built from the live under-contract
   * Listing so history shows even when the comp is not yet in Postgres.
   */
  historyEvents?: CompactListingHistoryEvent[]
}

/** Slim history row embedded on UAG comps / soft-loaded under each listing. */
export type CompactListingHistoryEvent = {
  date: string | null
  label: string
  detail?: string
}

export type ComparablesCriteria = {
  zip: string
  beds: number
  baths: number
  lotAcres: number | null
  /** Subject living area; comps are held within ±30% when present. */
  sqft: number | null
  vintageBucket: VintageBucketId
  vintageLabel: string
  /** Bordering vintage label(s) pulled in by the edge rule, when any. */
  vintageEdgeLabels?: string[]
}

/**
 * The subject's own vintage plus any edge-rule vintages, de-duplicated and
 * ordered oldest → newest, joined with pipes for a compact, scannable list
 * (e.g. `Pre-1900 | 1900–1940`).
 */
export function vintageCriteriaList(
  criteria: Pick<ComparablesCriteria, 'vintageLabel' | 'vintageEdgeLabels'>,
): string {
  const order = VINTAGE_BUCKETS.map((b) => b.label)
  const seen = new Set<string>()
  const labels = [criteria.vintageLabel, ...(criteria.vintageEdgeLabels ?? [])]
    .filter((label): label is string => Boolean(label))
    .filter((label) => {
      if (seen.has(label)) return false
      seen.add(label)
      return true
    })
  labels.sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return labels.join(' | ')
}

/** Max sold/rented and on-market comps returned per side. */
export const COMPARABLES_MATCH_LIMIT = 12

// ---------------------------------------------------------------------------
// Sold/rented look-back window.
//
// The Comparables + Comparable Rentals tabs let the user widen how far back
// closed comps are pulled. We cache a single fit-ranked superset over the max
// window (see COMPARABLES_MAX_LOOKBACK_MONTHS) per subject, then filter it to
// the selected window client-side — so switching look-back is instant and
// needs no extra fetch (everything is pre-warmed).
// ---------------------------------------------------------------------------

/** Selectable look-back windows, in months (every 6 months, 1yr → 3yr). */
export const COMPARABLES_LOOKBACK_OPTIONS = [12, 18, 24, 30, 36] as const
export type ComparablesLookbackMonths =
  (typeof COMPARABLES_LOOKBACK_OPTIONS)[number]

export type ComparablesResult = {
  sold: ComparableListing[]
  active: ComparableListing[]
  criteria: ComparablesCriteria | null
  /** Human-readable gaps when the subject lacks required match fields. */
  missingCriteria: string[]
  /** Admin-configured default look-back (months) for the Sales/Rentals spinner. */
  defaultLookbackMonths?: ComparablesLookbackMonths
}

/** Default look-back — exactly one year. */
export const COMPARABLES_DEFAULT_LOOKBACK_MONTHS: ComparablesLookbackMonths = 12

/** Widest window we cache; the reservoir every shorter window filters from. */
export const COMPARABLES_MAX_LOOKBACK_MONTHS = 36

/** How many sold comps to cache across the max window (reservoir size). */
export const COMPARABLES_SOLD_SUPERSET_LIMIT = 48

const LOOKBACK_MONTH_MS = 30.44 * 24 * 60 * 60 * 1000

/** Friendly label for a look-back window (e.g. 12 → "1 yr", 18 → "18 mo"). */
export function lookbackLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12
    return `${years} yr`
  }
  return `${months} mo`
}

/** True when a close date falls within `months` of now. */
export function withinLookbackMonths(
  closeDate: string | null | undefined,
  months: number,
  nowMs: number = Date.now(),
): boolean {
  if (!closeDate) return false
  const t = Date.parse(closeDate)
  if (Number.isNaN(t)) return false
  return t >= nowMs - months * LOOKBACK_MONTH_MS
}

/**
 * Filter a fit-ranked sold/rented superset to a look-back window, keeping the
 * top `limit` by fit (input order is fit rank, so a plain slice preserves it).
 */
export function soldWithinLookback(
  sold: ComparableListing[],
  months: number,
  limit: number = COMPARABLES_MATCH_LIMIT,
): ComparableListing[] {
  const now = Date.now()
  return sold
    .filter((comp) => withinLookbackMonths(comp.closeDate, months, now))
    .slice(0, limit)
}

export function fmtAcres(acres: number | null | undefined): string {
  if (acres == null || acres <= 0) return '—'
  if (acres < 0.01) return '<0.01 ac'
  if (acres < 10) return `${acres.toFixed(2)} ac`
  return `${acres.toFixed(1)} ac`
}

export function fmtSqft(sqft: number | null | undefined): string {
  if (sqft == null || sqft <= 0) return '—'
  return `${sqft.toLocaleString('en-US')} sqft`
}

export function fmtYearBuilt(yearBuilt: number | null | undefined): string | null {
  if (yearBuilt == null) return null
  return `Built ${yearBuilt}`
}

export function fmtPricePerSqft(
  pricePerSqft: number | null | undefined,
): string | null {
  if (pricePerSqft == null || pricePerSqft <= 0) return null
  return `$${Math.round(pricePerSqft)}/sqft`
}
