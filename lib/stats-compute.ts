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

export type MarketStatsPayload = {
  city: string
  kind: ListingKind
  activeCount: number
  medianPrice: number | null
  avgDaysOnMarket: number | null
  avgPricePerSqft: number | null
  avgBeds: number | null
  sampleSize: number
}

export type SalesByMonthPayload = {
  city: string
  kind: ListingKind
  data: { year: number; month: number; count: number }[]
  closedThisWeek: number
  closedThisWeekByZip: Record<string, number>
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

export function computeMarketStats(
  activeListings: Listing[],
  city: string,
  kind: ListingKind,
  closedListings: Listing[] = [],
): MarketStatsPayload {
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
    city,
    kind,
    activeCount: filteredActive.length,
    medianPrice: median(closedPrices) ?? median(activePrices),
    avgDaysOnMarket: mean(doms),
    avgPricePerSqft: kind === 'sale' ? mean(ppsf) : null,
    avgBeds: mean(beds),
    sampleSize: filteredActive.length,
  }
}

export const CLOSED_THIS_WEEK_DAYS = 7

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

export function computeClosedThisWeekCounts(
  listings: Listing[],
  kind: ListingKind,
): Pick<SalesByMonthPayload, 'closedThisWeek' | 'closedThisWeekByZip'> {
  const filtered = filterListingsByKind(listings, kind)
  let closedThisWeek = 0
  const closedThisWeekByZip: Record<string, number> = {}

  for (const l of filtered) {
    const { closeDate } = closeFieldsFromListing(l)
    if (!isClosedWithinDays(closeDate, CLOSED_THIS_WEEK_DAYS)) continue
    closedThisWeek += 1
    const zip = listingZip(l)
    if (zip) {
      closedThisWeekByZip[zip] = (closedThisWeekByZip[zip] ?? 0) + 1
    }
  }

  return { closedThisWeek, closedThisWeekByZip }
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
): ActiveByMonthPayload {
  const inventory = filterListingsByKind([...activeListings, ...closedListings], kind)
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

  const knownTotal = total - counts.unknown
  const buckets = VINTAGE_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    count: counts[b.id],
    share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
  }))
  const ranked = [...buckets].sort((a, b) => b.count - a.count)

  return {
    city,
    kind,
    period: `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`,
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
    const buckets = RENT_BUCKETS.map((b) => ({
      id: b.id,
      label: b.label,
      count: counts[b.id],
      share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
    }))
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
  const buckets = bandDefs.map((b) => ({
    id: b.id,
    label: b.label,
    count: counts[b.id] ?? 0,
    share: knownTotal > 0 ? (counts[b.id] ?? 0) / knownTotal : 0,
  }))
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
    const buckets: ActiveByPriceBucket[] = RENT_BUCKETS.map((b) => ({
      id: b.id,
      label: b.label,
      min: b.min,
      max: b.max,
      count: counts[b.id],
      share: knownTotal > 0 ? counts[b.id] / knownTotal : 0,
    }))
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
  const buckets: ActiveByPriceBucket[] = bandDefs.map((b) => ({
    id: b.id,
    label: b.label,
    min: b.min,
    max: b.max,
    count: counts[b.id] ?? 0,
    share: knownTotal > 0 ? (counts[b.id] ?? 0) / knownTotal : 0,
  }))
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

/** Active for-sale inventory for one Admin segment (Value / Mid / Luxury). */
export type ActiveBySegmentPricePayload = ActiveByPricePayload & {
  segmentId: 'value' | 'mid' | 'luxury'
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
 * Bucket active sale list prices into one inventory segment's fine steps
 * (Admin/Postgres Value · Mid-market · Luxury). Sale-only.
 */
export function computeActiveBySegmentPrice(
  activeListings: Listing[],
  city: string,
  segment: {
    id: 'value' | 'mid' | 'luxury'
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
  | 'avg-score-by-vintage'
  | 'avg-score-by-vintage-by-town'

export function inventorySegmentStatsScope(
  segmentId: 'value' | 'mid' | 'luxury',
): StatsCacheScope {
  if (segmentId === 'value') return 'active-by-value-price'
  if (segmentId === 'mid') return 'active-by-mid-price'
  return 'active-by-luxury-price'
}

export function statsCacheKey(scope: StatsCacheScope, city: string, kind: ListingKind): string {
  return `${scope}:${city}:${kind}`
}
