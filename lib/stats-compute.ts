import { closeFieldsFromListing, formatMlsStatus } from '@/lib/listing-history'
import { filterListingsByKind, type ListingKind } from '@/lib/listing-kind'
import { isUnderContractStatus } from '@/lib/listing-status'
import {
  classifySalePrice,
  emptyPriceCounts,
  PRICE_BUCKETS,
} from '@/lib/price-buckets'
import {
  classifyLuxuryPrice,
  emptyLuxuryPriceCounts,
  LUXURY_PRICE_BUCKETS,
  LUXURY_PRICE_FLOOR,
  topLuxurySaleBands,
} from '@/lib/luxury-price-buckets'
import {
  classifyRentPrice,
  emptyRentCounts,
  RENT_BUCKETS,
} from '@/lib/rent-buckets'
import {
  classifyYearBuilt,
  emptyVintageCounts,
  VINTAGE_BUCKETS,
  type VintageBucketId,
} from '@/lib/vintage-buckets'
import {
  closedListingTimestamp,
  closedSalePrice,
  inStatsClosedPeriod,
  STATS_CLOSED_PERIOD_START,
} from '@/lib/stats-listing-rows'
import { statsMonthChartYears } from '@/lib/stats-month-years'
import type { MarketStatsPools } from '@/lib/stats-market-pools'
import type { Listing } from '@/lib/rets'

function closedKindPrice(l: Listing, kind: ListingKind): number | null {
  if (kind === 'sale') return closedSalePrice(l)
  const { closePrice } = closeFieldsFromListing(l)
  const price = closePrice ?? l.price
  return price != null && price > 0 ? price : null
}

const CURRENT_YEAR = new Date().getFullYear()
const SALES_BY_MONTH_YEARS = statsMonthChartYears()

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

function getMonthFromTimestamp(ts: string | null): { year: number; month: number } | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * How a cached stats value was produced — written at rebuild time so the UI
 * can show methodology on hover without recomputing from listings.
 */
export type StatsValueCalc = {
  /** One-line tooltip explanation. */
  summary: string
  /** Optional extra lines under the summary. */
  detail?: string[]
  /** Machine-readable inputs for audit / future UI. */
  inputs?: Record<string, number | string | boolean | null>
}

export type MarketStatsPayload = {
  city: string
  kind: ListingKind
  activeCount: number
  medianPrice: number | null
  /** Cached explanation for {@link medianPrice} (bar / KPI hover). */
  medianPriceCalc?: StatsValueCalc
  /** Mean of the same price pool as median (closed period, else active list). */
  averagePrice: number | null
  averagePriceCalc?: StatsValueCalc
  avgDaysOnMarket: number | null
  avgDaysOnMarketCalc?: StatsValueCalc
  avgPricePerSqft: number | null
  avgPricePerSqftCalc?: StatsValueCalc
  avgBeds: number | null
  sampleSize: number
}

export type SalesByMonthPayload = {
  city: string
  kind: ListingKind
  data: { year: number; month: number; count: number }[]
  /** Closings with CloseDate in the past 7 days. */
  closedThisWeek: number
  closedThisWeekByZip: Record<string, number>
  /**
   * Sum of close prices for {@link closedThisWeek} (dollar volume).
   * Closings without a usable close/list price are counted but add $0.
   */
  closedThisWeekVolume: number
  /** Closings with CloseDate in the past 28 days (home Market Pulse). */
  closedLast4Weeks: number
  /**
   * Sum of close prices for {@link closedLast4Weeks} (dollar volume).
   * Closings without a usable close/list price are counted but add $0.
   */
  closedLast4WeeksVolume: number
  /** Active UC / UC-CTS whose StatusChangeTimestamp falls in the past 7 days (from Postgres, not RETS). */
  wentToContractThisWeek: number
  wentToContractThisWeekByZip: Record<string, number>
}

export type ActiveByMonthPayload = {
  city: string
  kind: ListingKind
  data: { year: number; month: number; count: number }[]
}

export type SalesByMonthByTownPayload = {
  kind: ListingKind
  towns: Record<string, SalesByMonthPayload['data']>
}

export type ActiveByMonthByTownPayload = {
  kind: ListingKind
  towns: Record<string, ActiveByMonthPayload['data']>
}

export type StatsBucketRow = {
  id: string
  label: string
  count: number
  share: number
  /** Cached explanation for this bucket’s count/share. */
  calc?: StatsValueCalc
}

export type SalesByVintagePayload = {
  city: string
  kind: ListingKind
  period: string
  totalSales: number
  knownYearBuilt: number
  unknownYearBuilt: number
  buckets: StatsBucketRow[]
  topBucket: StatsBucketRow | null
}

/** One vintage cohort’s Active Goldilocks average (for later “best value vintage”). */
export type AvgScoreByVintageBucket = {
  id: Exclude<VintageBucketId, 'unknown'>
  label: string
  count: number
  avgScore: number | null
  /** Share of scored listings with a known year built. */
  share: number
}

/**
 * Mean Active Goldilocks score by vintage within a town (or All).
 * Cached in stats_cache as `avg-score-by-vintage:{city}:{kind}`.
 */
export type AvgScoreByVintagePayload = {
  city: string
  kind: ListingKind
  statusBucket: 'Active'
  totalScored: number
  knownYearBuilt: number
  unknownYearBuilt: number
  buckets: AvgScoreByVintageBucket[]
  /** Highest avgScore among buckets with at least one scored listing. */
  bestValueBucket: AvgScoreByVintageBucket | null
}

export type AvgScoreByVintageByTownPayload = {
  kind: ListingKind
  towns: Record<string, AvgScoreByVintagePayload>
}

export type SalesByPricePayload = {
  city: string
  kind: ListingKind
  period: string
  totalSales: number
  knownPrice: number
  unknownPrice: number
  buckets: StatsBucketRow[]
  topBucket: StatsBucketRow | null
}

function periodLabel(): string {
  return `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`
}

function medianPriceCalcFor(
  city: string,
  kind: ListingKind,
  medianPrice: number | null,
  closedPriceCount: number,
  activePriceCount: number,
  activeCount: number,
): StatsValueCalc | undefined {
  if (medianPrice == null) return undefined
  const period = periodLabel()
  const closedNoun =
    kind === 'rental' ? 'closed lease rents' : 'closed sale prices'
  if (closedPriceCount > 0) {
    const n = closedPriceCount
    return {
      summary: `Median of ${n.toLocaleString()} ${closedNoun} in ${city} (${period}).`,
      detail: [
        `Mid-point of sorted closed/sold amounts with CloseDate in ${period}.`,
        `Active inventory (${activeCount.toLocaleString()}) is not used when closed samples exist.`,
      ],
      inputs: {
        source: 'closed',
        sampleSize: n,
        periodStart: STATS_CLOSED_PERIOD_START,
        periodEnd: CURRENT_YEAR,
        city,
        kind,
        medianPrice,
      },
    }
  }
  const n = activePriceCount
  if (n === 0) return undefined
  return {
    summary: `Median of ${n.toLocaleString()} active list prices in ${city} (fallback — no closed prices in ${period}).`,
    detail: [
      `No ${closedNoun} with a usable close price in ${period}, so active list prices were used.`,
    ],
    inputs: {
      source: 'active-fallback',
      sampleSize: n,
      periodStart: STATS_CLOSED_PERIOD_START,
      periodEnd: CURRENT_YEAR,
      city,
      kind,
      medianPrice,
    },
  }
}

/**
 * Reduce listings to the pools a market-stats payload needs.
 *
 * Only meaningful for a scope small enough to hold in memory — one town. The
 * all-towns pools come from a single Postgres aggregate instead
 * (readMarketStatsPools), which is why this returns pools rather than a payload.
 */
export function marketStatsPoolsFromListings(
  activeListings: Listing[],
  kind: ListingKind,
  closedListings: Listing[] = [],
): MarketStatsPools {
  const filteredActive = filterListingsByKind(activeListings, kind)
  const closedInPeriod = filterListingsByKind(closedListings, kind).filter((l) =>
    inStatsClosedPeriod(closedListingTimestamp(l)),
  )
  const closedPrices = closedInPeriod
    .map((l) => closedKindPrice(l, kind))
    .filter((p): p is number => p != null)
  const activePrices = filteredActive
    .map((l) => l.price)
    .filter((p): p is number => p != null && p > 0)

  const doms = filteredActive.map((l) => l.dom).filter((d): d is number => d != null && d >= 0)
  const ppsf =
    kind === 'sale'
      ? filteredActive
          .map((l) => (l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null))
          .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
      : []
  const beds = filteredActive.map((l) => l.beds).filter((b): b is number => b != null && b > 0)

  return {
    activeCount: filteredActive.length,
    closedPriceCount: closedPrices.length,
    closedPriceMedian: median(closedPrices),
    closedPriceMean: mean(closedPrices),
    activePriceCount: activePrices.length,
    activePriceMedian: median(activePrices),
    activePriceMean: mean(activePrices),
    domCount: doms.length,
    domMean: mean(doms),
    ppsfCount: ppsf.length,
    ppsfMean: mean(ppsf),
    bedsMean: mean(beds),
  }
}

/**
 * Build the cached payload from pool summaries — the single formatter for both
 * the per-town (in-memory) and all-towns (SQL aggregate) paths, so the two can
 * never drift in wording or rounding.
 */
export function marketStatsFromPools(
  pools: MarketStatsPools,
  city: string,
  kind: ListingKind,
): MarketStatsPayload {
  const hasClosed = pools.closedPriceCount > 0
  const medianPrice = hasClosed ? pools.closedPriceMedian : pools.activePriceMedian
  const averagePrice = hasClosed ? pools.closedPriceMean : pools.activePriceMean
  const pricePoolSize = hasClosed ? pools.closedPriceCount : pools.activePriceCount
  const avgDaysOnMarket = pools.domMean
  const avgPricePerSqft = kind === 'sale' ? pools.ppsfMean : null
  const activeCount = pools.activeCount

  return {
    city,
    kind,
    activeCount,
    medianPrice,
    medianPriceCalc: medianPriceCalcFor(
      city,
      kind,
      medianPrice,
      pools.closedPriceCount,
      pools.activePriceCount,
      activeCount,
    ),
    averagePrice,
    averagePriceCalc:
      averagePrice != null
        ? {
            summary: `Mean ${
              hasClosed ? 'close' : 'list'
            } price across ${pricePoolSize.toLocaleString()} ${
              kind === 'rental' ? 'rentals' : 'listings'
            } in ${city}.`,
            detail: [
              hasClosed
                ? 'Same closed-period pool as median price (mean instead of median).'
                : 'No closed prices in period — mean of active list prices.',
            ],
            inputs: {
              source: hasClosed ? 'closed-price-mean' : 'active-list-price-mean',
              sampleSize: pricePoolSize,
              city,
              kind,
              averagePrice,
            },
          }
        : undefined,
    avgDaysOnMarket,
    avgDaysOnMarketCalc:
      avgDaysOnMarket != null
        ? {
            summary: `Mean Days on Market across ${pools.domCount.toLocaleString()} active ${
              kind === 'rental' ? 'rentals' : 'listings'
            } in ${city} with a non-null DOM.`,
            detail: [
              `Sum of DOM ÷ ${pools.domCount.toLocaleString()} (active ${kind} only; closed sales are excluded).`,
            ],
            inputs: {
              source: 'active-dom-mean',
              sampleSize: pools.domCount,
              city,
              kind,
              avgDaysOnMarket,
            },
          }
        : undefined,
    avgPricePerSqft,
    avgPricePerSqftCalc:
      avgPricePerSqft != null
        ? {
            summary: `Mean list $/sqft across ${pools.ppsfCount.toLocaleString()} active sales in ${city} with price and sqft > 0.`,
            detail: ['Each listing contributes price ÷ living area; then average those ratios.'],
            inputs: {
              source: 'active-ppsf-mean',
              sampleSize: pools.ppsfCount,
              city,
              kind,
              avgPricePerSqft,
            },
          }
        : undefined,
    avgBeds: pools.bedsMean,
    sampleSize: activeCount,
  }
}

export function computeMarketStats(
  activeListings: Listing[],
  city: string,
  kind: ListingKind,
  closedListings: Listing[] = [],
): MarketStatsPayload {
  return marketStatsFromPools(
    marketStatsPoolsFromListings(activeListings, kind, closedListings),
    city,
    kind,
  )
}

export const CLOSED_THIS_WEEK_DAYS = 7
/** Trailing window for home Market Pulse Volume closed / Closings. */
export const CLOSED_LAST_4_WEEKS_DAYS = 28

export function isClosedWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return t >= Date.now() - days * 86_400_000
}

function listingZip(l: Listing): string | null {
  const zip = l.address.postalCode?.trim()
  return zip || null
}

function computeClosedWithinDaysCounts(
  listings: Listing[],
  kind: ListingKind,
  days: number,
): { count: number; volume: number; byZip: Record<string, number> } {
  const filtered = filterListingsByKind(listings, kind)
  let count = 0
  let volume = 0
  const byZip: Record<string, number> = {}

  for (const l of filtered) {
    const { closeDate } = closeFieldsFromListing(l)
    if (!isClosedWithinDays(closeDate, days)) continue
    count += 1
    const price = closedKindPrice(l, kind)
    if (price != null) volume += price
    const zip = listingZip(l)
    if (zip) {
      byZip[zip] = (byZip[zip] ?? 0) + 1
    }
  }

  return { count, volume, byZip }
}

export function computeClosedThisWeekCounts(
  listings: Listing[],
  kind: ListingKind,
): Pick<
  SalesByMonthPayload,
  'closedThisWeek' | 'closedThisWeekByZip' | 'closedThisWeekVolume'
> {
  const r = computeClosedWithinDaysCounts(
    listings,
    kind,
    CLOSED_THIS_WEEK_DAYS,
  )
  return {
    closedThisWeek: r.count,
    closedThisWeekByZip: r.byZip,
    closedThisWeekVolume: r.volume,
  }
}

export function computeClosedLast4WeeksCounts(
  listings: Listing[],
  kind: ListingKind,
): Pick<SalesByMonthPayload, 'closedLast4Weeks' | 'closedLast4WeeksVolume'> {
  const r = computeClosedWithinDaysCounts(
    listings,
    kind,
    CLOSED_LAST_4_WEEKS_DAYS,
  )
  return {
    closedLast4Weeks: r.count,
    closedLast4WeeksVolume: r.volume,
  }
}

/**
 * Count Active listings that went under contract in the past 7 days.
 * Uses Postgres Active rows (mls status + StatusChangeTimestamp) — never RETS.
 */
export function computeWentToContractThisWeekCounts(
  activeListings: Listing[],
  kind: ListingKind,
): Pick<SalesByMonthPayload, 'wentToContractThisWeek' | 'wentToContractThisWeekByZip'> {
  const filtered = filterListingsByKind(activeListings, kind)
  let wentToContractThisWeek = 0
  const wentToContractThisWeekByZip: Record<string, number> = {}

  for (const l of filtered) {
    if (!isUnderContractStatus(l.status)) continue
    if (!isClosedWithinDays(l.statusChangeTimestamp, CLOSED_THIS_WEEK_DAYS)) continue
    wentToContractThisWeek += 1
    const zip = listingZip(l)
    if (zip) {
      wentToContractThisWeekByZip[zip] =
        (wentToContractThisWeekByZip[zip] ?? 0) + 1
    }
  }

  return { wentToContractThisWeek, wentToContractThisWeekByZip }
}

export function computeSalesByMonth(
  listings: Listing[],
  city: string,
  kind: ListingKind,
): SalesByMonthPayload {
  const filtered = filterListingsByKind(listings, kind)
  const counts = new Map<string, number>()

  for (const l of filtered) {
    // CloseDate first — StatusChangeTimestamp is often the pending/UC flip,
    // which under-counts true closings and blows up months-supply.
    const ts = closedListingTimestamp(l)
    const ym = getMonthFromTimestamp(ts)
    if (!ym) continue
    if (!SALES_BY_MONTH_YEARS.includes(ym.year)) continue
    const key = `${ym.year}-${ym.month}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const data: SalesByMonthPayload['data'] = []
  for (const year of SALES_BY_MONTH_YEARS) {
    const maxMonth = year < CURRENT_YEAR ? 12 : new Date().getMonth() + 1
    for (let month = 1; month <= 12; month++) {
      data.push({
        year,
        month,
        count: month <= maxMonth ? (counts.get(`${year}-${month}`) ?? 0) : 0,
      })
    }
  }

  return {
    city,
    kind,
    data,
    ...computeClosedThisWeekCounts(listings, kind),
    ...computeClosedLast4WeeksCounts(listings, kind),
    wentToContractThisWeek: 0,
    wentToContractThisWeekByZip: {},
  }
}

function parseTimestampMs(ts: string | null | undefined): number | null {
  if (!ts) return null
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

function monthEndMs(year: number, month: number): number {
  return Date.UTC(year, month, 0, 23, 59, 59, 999)
}

function listingListMs(l: Listing): number | null {
  return parseTimestampMs(l.listDate) ?? parseTimestampMs(l.statusChangeTimestamp)
}

/** When a listing left Active/Coming Soon inventory (pending, closed, expired, etc.). */
function listingLeftMarketMs(l: Listing): number | null {
  const status = formatMlsStatus(l.status)
  if (status === 'Closed') {
    const { closeDate } = closeFieldsFromListing(l)
    return parseTimestampMs(closeDate) ?? parseTimestampMs(l.statusChangeTimestamp)
  }
  if (
    status === 'Pending' ||
    status === 'Expired' ||
    status === 'Withdrawn' ||
    status === 'Hold' ||
    status === 'Temp off market'
  ) {
    return parseTimestampMs(l.statusChangeTimestamp)
  }
  return null
}

/** True when the listing was on market (Active/Coming Soon) at month-end. */
function wasActiveAtMonthEnd(l: Listing, year: number, month: number): boolean {
  const listMs = listingListMs(l)
  if (listMs == null) return false
  const endMs = monthEndMs(year, month)
  if (listMs > endMs) return false
  const leftMs = listingLeftMarketMs(l)
  if (leftMs != null && leftMs <= endMs) return false
  return true
}

/** End-of-month active inventory counts (2019 → current). */
export function computeActiveByMonth(
  activeListings: Listing[],
  closedListings: Listing[],
  city: string,
  kind: ListingKind,
  /** Expired / withdrawn history — without these, older years look too linear. */
  offMarketListings: readonly Listing[] = [],
): ActiveByMonthPayload {
  const inventory = filterListingsByKind(
    [...activeListings, ...closedListings, ...offMarketListings],
    kind,
  )
  const counts = new Map<string, number>()

  for (const year of SALES_BY_MONTH_YEARS) {
    const maxMonth = year < CURRENT_YEAR ? 12 : new Date().getMonth() + 1
    for (let month = 1; month <= maxMonth; month++) {
      let count = 0
      for (const l of inventory) {
        if (wasActiveAtMonthEnd(l, year, month)) count += 1
      }
      counts.set(`${year}-${month}`, count)
    }
  }

  const data: ActiveByMonthPayload['data'] = []
  for (const year of SALES_BY_MONTH_YEARS) {
    const maxMonth = year < CURRENT_YEAR ? 12 : new Date().getMonth() + 1
    for (let month = 1; month <= 12; month++) {
      data.push({
        year,
        month,
        count: month <= maxMonth ? (counts.get(`${year}-${month}`) ?? 0) : 0,
      })
    }
  }

  return { city, kind, data }
}

export function computeSalesByVintage(
  listings: Listing[],
  city: string,
  kind: ListingKind,
): SalesByVintagePayload {
  const filtered = filterListingsByKind(listings, kind)
  const counts = emptyVintageCounts()
  let total = 0

  for (const l of filtered) {
    const ts = closedListingTimestamp(l)
    if (!inStatsClosedPeriod(ts)) continue
    total += 1
    counts[classifyYearBuilt(l.yearBuilt)] += 1
  }

  return salesByVintageFromCounts(counts, total, city, kind)
}

/** Assemble the payload from per-vintage counts (compute and rollup share this). */
function salesByVintageFromCounts(
  counts: Record<VintageBucketId, number>,
  total: number,
  city: string,
  kind: ListingKind,
): SalesByVintagePayload {
  const knownTotal = total - counts.unknown
  const period = `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`
  const noun = kind === 'rental' ? 'closed leases' : 'closed sales'
  const buckets = VINTAGE_BUCKETS.map((b) => {
    const count = counts[b.id]
    const share = knownTotal > 0 ? count / knownTotal : 0
    const pct = knownTotal > 0 ? Math.round(share * 1000) / 10 : 0
    return {
      id: b.id,
      label: b.label,
      count,
      share,
      calc: {
        summary: `${count.toLocaleString()} of ${knownTotal.toLocaleString()} ${noun} with known year built in ${city} (${period}) are ${b.label} (${pct}%).`,
        detail: [
          `Share = vintage count ÷ known year-built closings (unknown year built excluded from the denominator).`,
          `Total closings in period: ${total.toLocaleString()}.`,
        ],
        inputs: {
          city,
          kind,
          period,
          vintageLabel: b.label,
          count,
          knownTotal,
          totalSales: total,
          share,
        },
      } satisfies StatsValueCalc,
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    period,
    totalSales: total,
    knownYearBuilt: knownTotal,
    unknownYearBuilt: counts.unknown,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

/**
 * Average Active Goldilocks score per vintage bucket.
 * `scored` rows must already be filtered to the target town (or All) and have
 * a non-null score; kind filtering is applied here.
 */
export function computeAvgScoreByVintage(
  scored: readonly {
    yearBuilt: number | null
    goldilocksScore: number
    propertyType: string
    raw?: Record<string, string>
  }[],
  city: string,
  kind: ListingKind,
): AvgScoreByVintagePayload {
  const filtered = filterListingsByKind(scored, kind)
  const sums = emptyVintageCounts()
  const counts = emptyVintageCounts()

  for (const row of filtered) {
    if (!Number.isFinite(row.goldilocksScore)) continue
    const bucket = classifyYearBuilt(row.yearBuilt)
    counts[bucket] += 1
    sums[bucket] += row.goldilocksScore
  }

  const totalScored = Object.values(counts).reduce((a, b) => a + b, 0)
  const knownYearBuilt = totalScored - counts.unknown
  const buckets: AvgScoreByVintageBucket[] = VINTAGE_BUCKETS.map((b) => {
    const count = counts[b.id]
    const avgScore =
      count > 0 ? Math.round((sums[b.id] / count) * 10) / 10 : null
    return {
      id: b.id as Exclude<VintageBucketId, 'unknown'>,
      label: b.label,
      count,
      avgScore,
      share: knownYearBuilt > 0 ? count / knownYearBuilt : 0,
    }
  })

  const ranked = [...buckets]
    .filter((b) => b.count > 0 && b.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))

  return {
    city,
    kind,
    statusBucket: 'Active',
    totalScored,
    knownYearBuilt,
    unknownYearBuilt: counts.unknown,
    buckets,
    bestValueBucket: ranked[0] ?? null,
  }
}

function closedMatchesPricePeriod(
  ts: string | null,
  year: number | null | undefined,
): boolean {
  if (!ts) return false
  if (year == null || !Number.isFinite(year)) return inStatsClosedPeriod(ts)
  const d = new Date(ts)
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year
}

function salesByPricePeriodLabel(year: number | null | undefined): string {
  if (year != null && Number.isFinite(year)) return String(year)
  return `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`
}

export function computeSalesByPrice(
  listings: Listing[],
  city: string,
  kind: ListingKind,
  /** Admin-configured sale bands; defaults to shipped PRICE_BUCKETS. */
  saleBuckets: readonly (typeof PRICE_BUCKETS)[number][] = PRICE_BUCKETS,
  /** When set, only count closings in that calendar year. */
  year: number | null = null,
): SalesByPricePayload {
  const filtered = filterListingsByKind(listings, kind)
  const period = salesByPricePeriodLabel(year)

  if (kind === 'rental') {
    const counts = emptyRentCounts()
    let total = 0
    for (const l of filtered) {
      const ts = closedListingTimestamp(l)
      if (!closedMatchesPricePeriod(ts, year)) continue
      total += 1
      counts[classifyRentPrice(closedKindPrice(l, kind))] += 1
    }
    const knownTotal = total - counts.unknown
    const buckets = RENT_BUCKETS.map((b) => {
      const count = counts[b.id]
      const share = knownTotal > 0 ? count / knownTotal : 0
      return {
        id: b.id,
        label: b.label,
        count,
        share,
        calc: bucketCalc({
          city,
          kind,
          period,
          bandLabel: b.label,
          count,
          knownTotal,
          total,
          share,
          noun: 'closed leases',
        }),
      }
    })
    const ranked = [...buckets].sort((a, b) => b.count - a.count)
    return {
      city,
      kind,
      period,
      totalSales: total,
      knownPrice: knownTotal,
      unknownPrice: counts.unknown,
      buckets,
      topBucket: ranked[0]?.count ? ranked[0] : null,
    }
  }

  const bandDefs = saleBuckets.length > 0 ? saleBuckets : PRICE_BUCKETS
  const counts = emptyPriceCounts(bandDefs)
  let total = 0
  for (const l of filtered) {
    const ts = closedListingTimestamp(l)
    if (!closedMatchesPricePeriod(ts, year)) continue
    total += 1
    const id = classifySalePrice(closedSalePrice(l), bandDefs)
    counts[id] = (counts[id] ?? 0) + 1
  }

  const knownTotal = total - (counts.unknown ?? 0)
  const buckets = bandDefs.map((b) => {
    const count = counts[b.id] ?? 0
    const share = knownTotal > 0 ? count / knownTotal : 0
    return {
      id: b.id,
      label: b.label,
      count,
      share,
      calc: bucketCalc({
        city,
        kind,
        period,
        bandLabel: b.label,
        count,
        knownTotal,
        total,
        share,
        noun: 'closed sales',
      }),
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    period,
    totalSales: total,
    knownPrice: knownTotal,
    unknownPrice: counts.unknown ?? 0,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

function bucketCalc(args: {
  city: string
  kind: ListingKind
  period: string
  bandLabel: string
  count: number
  knownTotal: number
  total: number
  share: number
  noun: string
}): StatsValueCalc {
  const pct = args.knownTotal > 0 ? Math.round(args.share * 1000) / 10 : 0
  return {
    summary: `${args.count.toLocaleString()} of ${args.knownTotal.toLocaleString()} ${args.noun} with known price in ${args.city} (${args.period}) fell in ${args.bandLabel} (${pct}%).`,
    detail: [
      `Share = band count ÷ known-price closings (unknown-price closings excluded from the denominator).`,
      `Total closings in period: ${args.total.toLocaleString()}.`,
    ],
    inputs: {
      city: args.city,
      kind: args.kind,
      period: args.period,
      bandLabel: args.bandLabel,
      count: args.count,
      knownTotal: args.knownTotal,
      totalSales: args.total,
      share: args.share,
    },
  }
}

export type SalesByPriceByTownPayload = {
  kind: ListingKind
  period: string
  year: number
  towns: Record<string, SalesByPricePayload>
}

export function computeSalesByPriceByTown(
  byTownClosed: Readonly<Record<string, readonly Listing[]>>,
  kind: ListingKind,
  townKeys: readonly string[],
  saleBuckets: readonly (typeof PRICE_BUCKETS)[number][] = PRICE_BUCKETS,
  year: number = CURRENT_YEAR,
): SalesByPriceByTownPayload {
  const towns: Record<string, SalesByPricePayload> = {}
  for (const town of townKeys) {
    towns[town] = computeSalesByPrice(
      [...(byTownClosed[town] ?? [])],
      town,
      kind,
      saleBuckets,
      year,
    )
  }
  return { kind, period: String(year), year, towns }
}

/** Active (for-sale / for-rent) inventory counts by Admin price bands. */
export type ActiveByPriceBucket = StatsBucketRow & {
  min: number
  max: number | null
}

export type ActiveByPricePayload = {
  city: string
  kind: ListingKind
  totalActive: number
  knownPrice: number
  unknownPrice: number
  buckets: ActiveByPriceBucket[]
  topBucket: ActiveByPriceBucket | null
}

/**
 * Bucket active listing list prices into sale (Admin) or rent (code) bands.
 * Intended for stats_cache — not for live RETS / deal-board aggregation.
 */
export function computeActiveByPrice(
  activeListings: Listing[],
  city: string,
  kind: ListingKind,
  saleBuckets: readonly (typeof PRICE_BUCKETS)[number][] = PRICE_BUCKETS,
): ActiveByPricePayload {
  const filtered = filterListingsByKind(activeListings, kind)

  if (kind === 'rental') {
    const counts = emptyRentCounts()
    let total = 0
    for (const l of filtered) {
      total += 1
      counts[classifyRentPrice(l.price)] += 1
    }
    const knownTotal = total - counts.unknown
    const buckets: ActiveByPriceBucket[] = RENT_BUCKETS.map((b) => {
      const count = counts[b.id]
      const share = knownTotal > 0 ? count / knownTotal : 0
      return {
        id: b.id,
        label: b.label,
        min: b.min,
        max: b.max,
        count,
        share,
        calc: bucketCalc({
          city,
          kind,
          period: 'active',
          bandLabel: b.label,
          count,
          knownTotal,
          total,
          share,
          noun: 'active rentals',
        }),
      }
    })
    const ranked = [...buckets].sort((a, b) => b.count - a.count)
    return {
      city,
      kind,
      totalActive: total,
      knownPrice: knownTotal,
      unknownPrice: counts.unknown,
      buckets,
      topBucket: ranked[0]?.count ? ranked[0] : null,
    }
  }

  const bandDefs = saleBuckets.length > 0 ? saleBuckets : PRICE_BUCKETS
  const counts = emptyPriceCounts(bandDefs)
  let total = 0
  for (const l of filtered) {
    total += 1
    const id = classifySalePrice(l.price, bandDefs)
    counts[id] = (counts[id] ?? 0) + 1
  }

  const knownTotal = total - (counts.unknown ?? 0)
  const buckets: ActiveByPriceBucket[] = bandDefs.map((b) => {
    const count = counts[b.id] ?? 0
    const share = knownTotal > 0 ? count / knownTotal : 0
    return {
      id: b.id,
      label: b.label,
      min: b.min,
      max: b.max,
      count,
      share,
      calc: bucketCalc({
        city,
        kind,
        period: 'active',
        bandLabel: b.label,
        count,
        knownTotal,
        total,
        share,
        noun: 'active listings',
      }),
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    totalActive: total,
    knownPrice: knownTotal,
    unknownPrice: counts.unknown ?? 0,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

/** Active for-sale inventory for one Admin market band (Value / Mid / Luxury / Discount). */
export type ActiveBySegmentPricePayload = ActiveByPricePayload & {
  segmentId: 'value' | 'mid' | 'luxury' | 'discount'
  segmentLabel: string
  /** Inclusive segment floor. */
  segmentMin: number
  /** Inclusive segment ceiling; null = open. */
  segmentMax: number | null
  /** Actives inside the segment price range. */
  segmentActive: number
  /** Actives with known price outside the segment range. */
  outsideSegment: number
  /** Legacy luxury fields (same as segmentActive / outsideSegment when luxury). */
  luxuryActive: number
  belowLuxury: number
  /** Top 3 Admin sale bands — luxury metadata only. */
  luxuryBands: Array<{
    id: string
    label: string
    min: number
    max: number | null
  }>
}

/** @deprecated Prefer ActiveBySegmentPricePayload. */
export type ActiveByLuxuryPricePayload = ActiveBySegmentPricePayload

/**
 * Bucket active sale list prices into one market band's fine steps
 * (Admin/Postgres Value · Mid-market · Luxury · Discount). Sale-only.
 */
export function computeActiveBySegmentPrice(
  activeListings: Listing[],
  city: string,
  segment: {
    id: 'value' | 'mid' | 'luxury' | 'discount'
    label: string
    min: number
    max: number | null
    steps: readonly (typeof PRICE_BUCKETS)[number][]
  },
  saleBuckets: readonly (typeof PRICE_BUCKETS)[number][] = PRICE_BUCKETS,
): ActiveBySegmentPricePayload {
  const steps = segment.steps.length ? segment.steps : LUXURY_PRICE_BUCKETS
  const filtered = filterListingsByKind(activeListings, 'sale')
  const counts = emptyLuxuryPriceCounts(steps)
  let total = 0
  let outsideSegment = 0
  let segmentActive = 0

  for (const l of filtered) {
    total += 1
    const price = l.price
    if (price == null || !Number.isFinite(price) || price <= 0) {
      counts.unknown = (counts.unknown ?? 0) + 1
      continue
    }
    const aboveMax = segment.max != null && price > segment.max
    if (price < segment.min || aboveMax) {
      outsideSegment += 1
      continue
    }
    segmentActive += 1
    const id = classifyLuxuryPrice(price, steps)
    counts[id] = (counts[id] ?? 0) + 1
  }

  const knownInSegment = segmentActive
  const buckets: ActiveByPriceBucket[] = steps.map((b) => ({
    id: b.id,
    label: b.label,
    min: b.min,
    max: b.max,
    count: counts[b.id] ?? 0,
    share: knownInSegment > 0 ? (counts[b.id] ?? 0) / knownInSegment : 0,
  }))
  const ranked = [...buckets].sort((a, b) => b.count - a.count)
  const luxuryBands =
    segment.id === 'luxury'
      ? topLuxurySaleBands(saleBuckets, 3).map((b) => ({
          id: b.id,
          label: b.label,
          min: b.min,
          max: b.max,
        }))
      : []

  return {
    city,
    kind: 'sale',
    segmentId: segment.id,
    segmentLabel: segment.label,
    segmentMin: segment.min,
    segmentMax: segment.max,
    totalActive: total,
    knownPrice: knownInSegment,
    unknownPrice: counts.unknown ?? 0,
    outsideSegment,
    segmentActive,
    belowLuxury: outsideSegment,
    luxuryActive: segmentActive,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
    luxuryBands,
  }
}

/**
 * Bucket active sale list prices into luxury fine bands (Admin/Postgres
 * inventory segment steps; defaults $4–10M @ $1M, $10M+ @ $5M). Sale-only.
 */
export function computeActiveByLuxuryPrice(
  activeListings: Listing[],
  city: string,
  saleBuckets: readonly (typeof PRICE_BUCKETS)[number][] = PRICE_BUCKETS,
  options?: {
    floor?: number
    steps?: readonly (typeof PRICE_BUCKETS)[number][]
    label?: string
    max?: number | null
  },
): ActiveByLuxuryPricePayload {
  return computeActiveBySegmentPrice(
    activeListings,
    city,
    {
      id: 'luxury',
      label: options?.label ?? 'Luxury',
      min: options?.floor ?? LUXURY_PRICE_FLOOR,
      max: options?.max ?? null,
      steps: options?.steps?.length ? options.steps : LUXURY_PRICE_BUCKETS,
    },
    saleBuckets,
  )
}

// ---------------------------------------------------------------------------
// All-towns rollups
//
// Every payload below is additive: an all-towns histogram is the sum of the
// per-town histograms, and the totals are the sums of the totals. So the "All"
// scope is built by adding up the per-town payloads already sitting in
// stats_cache instead of re-reading every listing in the market — which is what
// used to exhaust V8's heap. Shares, top buckets, and the calc explainers are
// recomputed here from the summed counts, using the same helpers the per-town
// path uses, so the wording and rounding cannot drift.
//
// Non-additive values (median price, mean DOM) cannot be combined from parts and
// come from a Postgres aggregate instead — see readMarketStatsPools().
//
// Callers must pass at least one part; an empty list yields a zeroed payload
// with no buckets, which is a broken chart rather than an empty one.
// ---------------------------------------------------------------------------

function sumBy<T>(parts: readonly T[], pick: (part: T) => number): number {
  return parts.reduce((total, part) => total + (pick(part) || 0), 0)
}

/**
 * Bucket templates (first-seen order) plus summed counts across parts.
 *
 * Templates come from the parts rather than the current band config so labels,
 * min, and max survive untouched. A town payload built before a band change
 * contributes its old ids; those rows are rewritten by the next rebuild of that
 * town, at which point the sum lines up again.
 */
function sumBuckets<T extends { id: string; count: number }>(
  parts: readonly { buckets: readonly T[] }[],
): { templates: T[]; counts: Map<string, number> } {
  const templates: T[] = []
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const part of parts) {
    for (const bucket of part.buckets) {
      if (!seen.has(bucket.id)) {
        seen.add(bucket.id)
        templates.push(bucket)
      }
      counts.set(bucket.id, (counts.get(bucket.id) ?? 0) + (bucket.count || 0))
    }
  }
  return { templates, counts }
}

/** Sum per-town closed-vintage histograms into one scope. */
export function rollupSalesByVintage(
  parts: readonly SalesByVintagePayload[],
  city: string,
  kind: ListingKind,
): SalesByVintagePayload {
  const counts = emptyVintageCounts()
  for (const part of parts) {
    for (const bucket of part.buckets) {
      if (bucket.id in counts) {
        counts[bucket.id as VintageBucketId] += bucket.count || 0
      }
    }
    counts.unknown += part.unknownYearBuilt || 0
  }
  return salesByVintageFromCounts(
    counts,
    sumBy(parts, (part) => part.totalSales),
    city,
    kind,
  )
}

/** Sum per-town closed-price histograms into one scope. */
export function rollupSalesByPrice(
  parts: readonly SalesByPricePayload[],
  city: string,
  kind: ListingKind,
): SalesByPricePayload {
  const { templates, counts } = sumBuckets(parts)
  const total = sumBy(parts, (part) => part.totalSales)
  const knownTotal = sumBy(parts, (part) => part.knownPrice)
  const period = parts[0]?.period ?? salesByPricePeriodLabel(null)
  const noun = kind === 'rental' ? 'closed leases' : 'closed sales'

  const buckets = templates.map((template) => {
    const count = counts.get(template.id) ?? 0
    const share = knownTotal > 0 ? count / knownTotal : 0
    return {
      id: template.id,
      label: template.label,
      count,
      share,
      calc: bucketCalc({
        city,
        kind,
        period,
        bandLabel: template.label,
        count,
        knownTotal,
        total,
        share,
        noun,
      }),
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    period,
    totalSales: total,
    knownPrice: knownTotal,
    unknownPrice: sumBy(parts, (part) => part.unknownPrice),
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

/** Sum per-town active-price histograms into one scope. */
export function rollupActiveByPrice(
  parts: readonly ActiveByPricePayload[],
  city: string,
  kind: ListingKind,
): ActiveByPricePayload {
  const { templates, counts } = sumBuckets(parts)
  const total = sumBy(parts, (part) => part.totalActive)
  const knownTotal = sumBy(parts, (part) => part.knownPrice)
  const noun = kind === 'rental' ? 'active rentals' : 'active listings'

  const buckets: ActiveByPriceBucket[] = templates.map((template) => {
    const count = counts.get(template.id) ?? 0
    const share = knownTotal > 0 ? count / knownTotal : 0
    return {
      id: template.id,
      label: template.label,
      min: template.min,
      max: template.max,
      count,
      share,
      calc: bucketCalc({
        city,
        kind,
        period: 'active',
        bandLabel: template.label,
        count,
        knownTotal,
        total,
        share,
        noun,
      }),
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    totalActive: total,
    knownPrice: knownTotal,
    unknownPrice: sumBy(parts, (part) => part.unknownPrice),
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

/**
 * Sum per-town inventory-segment histograms into one scope. Segment metadata
 * (id, label, floor, ceiling, luxury bands) is identical across towns in a
 * rebuild, so it is carried from the first part.
 */
export function rollupActiveBySegmentPrice(
  parts: readonly ActiveBySegmentPricePayload[],
  city: string,
): ActiveBySegmentPricePayload {
  const first = parts[0]
  const { templates, counts } = sumBuckets(parts)
  const segmentActive = sumBy(parts, (part) => part.segmentActive)
  const buckets: ActiveByPriceBucket[] = templates.map((template) => {
    const count = counts.get(template.id) ?? 0
    return {
      id: template.id,
      label: template.label,
      min: template.min,
      max: template.max,
      count,
      // Segment shares are of the segment, not of all known-price actives.
      share: segmentActive > 0 ? count / segmentActive : 0,
    }
  })
  const ranked = [...buckets].sort((a, b) => b.count - a.count)
  const outsideSegment = sumBy(parts, (part) => part.outsideSegment)

  return {
    city,
    kind: 'sale',
    segmentId: first?.segmentId ?? 'luxury',
    segmentLabel: first?.segmentLabel ?? 'Luxury',
    segmentMin: first?.segmentMin ?? LUXURY_PRICE_FLOOR,
    segmentMax: first?.segmentMax ?? null,
    totalActive: sumBy(parts, (part) => part.totalActive),
    knownPrice: segmentActive,
    unknownPrice: sumBy(parts, (part) => part.unknownPrice),
    outsideSegment,
    segmentActive,
    belowLuxury: outsideSegment,
    luxuryActive: segmentActive,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
    luxuryBands: first?.luxuryBands ?? [],
  }
}

/**
 * Combine per-town Goldilocks-by-vintage averages into one scope.
 *
 * Counts are additive and each per-town average is weighted by its own count,
 * so the result is the mean of the underlying scores to within the 1-decimal
 * rounding the per-town payloads already carry.
 */
export function rollupAvgScoreByVintage(
  parts: readonly AvgScoreByVintagePayload[],
  city: string,
  kind: ListingKind,
): AvgScoreByVintagePayload {
  const counts = emptyVintageCounts()
  const weighted = emptyVintageCounts()
  for (const part of parts) {
    for (const bucket of part.buckets) {
      if (!(bucket.id in counts)) continue
      const count = bucket.count || 0
      counts[bucket.id] += count
      if (bucket.avgScore != null) weighted[bucket.id] += bucket.avgScore * count
    }
  }

  const totalScored = sumBy(parts, (part) => part.totalScored)
  const unknownYearBuilt = sumBy(parts, (part) => part.unknownYearBuilt)
  const knownYearBuilt = totalScored - unknownYearBuilt
  const buckets: AvgScoreByVintageBucket[] = VINTAGE_BUCKETS.map((b) => {
    const id = b.id as Exclude<VintageBucketId, 'unknown'>
    const count = counts[id]
    return {
      id,
      label: b.label,
      count,
      avgScore: count > 0 ? Math.round((weighted[id] / count) * 10) / 10 : null,
      share: knownYearBuilt > 0 ? count / knownYearBuilt : 0,
    }
  })
  const ranked = [...buckets]
    .filter((b) => b.count > 0 && b.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))

  return {
    city,
    kind,
    statusBucket: 'Active',
    totalScored,
    knownYearBuilt,
    unknownYearBuilt,
    buckets,
    bestValueBucket: ranked[0] ?? null,
  }
}

export type StatsCacheScope =
  | 'market-stats'
  | 'market-stats-listings'
  | 'sales-by-month'
  | 'active-by-month'
  | 'active-by-month-by-town'
  | 'sales-by-month-by-town'
  | 'sales-by-vintage'
  | 'sales-by-price'
  | 'active-by-price'
  | 'active-by-luxury-price'
  | 'active-by-mid-price'
  | 'active-by-value-price'
  | 'active-by-discount-price'
  | 'avg-score-by-vintage'
  | 'avg-score-by-vintage-by-town'

export function inventorySegmentStatsScope(
  segmentId: 'value' | 'mid' | 'luxury' | 'discount',
): StatsCacheScope {
  if (segmentId === 'value') return 'active-by-value-price'
  if (segmentId === 'mid') return 'active-by-mid-price'
  if (segmentId === 'discount') return 'active-by-discount-price'
  return 'active-by-luxury-price'
}

export function statsCacheKey(scope: StatsCacheScope, city: string, kind: ListingKind): string {
  return `${scope}:${city}:${kind}`
}
