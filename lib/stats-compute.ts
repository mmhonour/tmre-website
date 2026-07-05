import { closeFieldsFromListing } from '@/lib/listing-history'
import { filterListingsByKind, type ListingKind } from '@/lib/listing-kind'
import {
  classifySalePrice,
  emptyPriceCounts,
  PRICE_BUCKETS,
} from '@/lib/price-buckets'
import {
  classifyRentPrice,
  emptyRentCounts,
  RENT_BUCKETS,
} from '@/lib/rent-buckets'
import {
  classifyYearBuilt,
  emptyVintageCounts,
  VINTAGE_BUCKETS,
} from '@/lib/vintage-buckets'
import {
  closedListingTimestamp,
  closedSalePrice,
  inStatsClosedPeriod,
  STATS_CLOSED_PERIOD_START,
} from '@/lib/stats-listing-rows'
import type { Listing } from '@/lib/rets'

function closedKindPrice(l: Listing, kind: ListingKind): number | null {
  if (kind === 'sale') return closedSalePrice(l)
  const { closePrice } = closeFieldsFromListing(l)
  const price = closePrice ?? l.price
  return price != null && price > 0 ? price : null
}

const CURRENT_YEAR = new Date().getFullYear()
const SALES_BY_MONTH_YEARS = [2024, 2025, 2026]

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

export function computeSalesByMonth(
  listings: Listing[],
  city: string,
  kind: ListingKind,
): SalesByMonthPayload {
  const filtered = filterListingsByKind(listings, kind)
  const counts = new Map<string, number>()

  for (const l of filtered) {
    const ts = l.statusChangeTimestamp ?? l.modificationTimestamp
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

  return { city, kind, data, ...computeClosedThisWeekCounts(listings, kind) }
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

export function computeSalesByPrice(
  listings: Listing[],
  city: string,
  kind: ListingKind,
): SalesByPricePayload {
  const filtered = filterListingsByKind(listings, kind)

  if (kind === 'rental') {
    const counts = emptyRentCounts()
    let total = 0
    for (const l of filtered) {
      const ts = closedListingTimestamp(l)
      if (!inStatsClosedPeriod(ts)) continue
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
      period: `${STATS_CLOSED_PERIOD_START}–${CURRENT_YEAR}`,
      totalSales: total,
      knownPrice: knownTotal,
      unknownPrice: counts.unknown,
      buckets,
      topBucket: ranked[0]?.count ? ranked[0] : null,
    }
  }

  const counts = emptyPriceCounts()
  let total = 0
  for (const l of filtered) {
    const ts = closedListingTimestamp(l)
    if (!inStatsClosedPeriod(ts)) continue
    total += 1
    counts[classifySalePrice(closedSalePrice(l))] += 1
  }

  const knownTotal = total - counts.unknown
  const buckets = PRICE_BUCKETS.map((b) => ({
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
    knownPrice: knownTotal,
    unknownPrice: counts.unknown,
    buckets,
    topBucket: ranked[0]?.count ? ranked[0] : null,
  }
}

export type StatsCacheScope =
  | 'market-stats'
  | 'market-stats-listings'
  | 'sales-by-month'
  | 'sales-by-vintage'
  | 'sales-by-price'

export function statsCacheKey(scope: StatsCacheScope, city: string, kind: ListingKind): string {
  return `${scope}:${city}:${kind}`
}
