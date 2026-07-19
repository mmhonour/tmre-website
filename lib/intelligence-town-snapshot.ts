import 'server-only'

import { fetchActiveListingsForCity, fetchClosedListingsForCity } from '@/lib/listings-store'
import { readListingsFromDb } from '@/lib/db/listings-repo'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import type {
  IntelligenceTownSnapshot,
  SnapshotMetric,
  SnapshotValueSignal,
} from '@/lib/intelligence-town-snapshot-types'
import { computeSalesByMonth, statsCacheKey, type SalesByMonthPayload } from '@/lib/stats-compute'
import { readMonthsSupplyCached } from '@/lib/months-supply-cache'
import type { Listing } from '@/lib/rets'
import { formatTownZipPlace, isTmreTown, TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

/** In-process overlay over SQLite stats_cache town snapshots. */
const SNAPSHOT_TTL_MS = 15 * 60 * 1000
const snapshotCache = new Map<
  string,
  { expiresAt: number; snapshot: IntelligenceTownSnapshot }
>()

export type {
  IntelligenceTownSnapshot,
  SnapshotMetric,
  SnapshotValueSignal,
} from '@/lib/intelligence-town-snapshot-types'

export type IntelligenceDisplayListing = {
  key: string
  address: string
  city: string | null
  price: number
  pricePerSqft: number | null
  sqft: number | null
  dom: number | null
  status: IntelligenceRowStatus
  isRental: boolean
  isCommercial: boolean
  propertyType?: string
  yearBuilt?: number | null
  beds?: number | null
  baths?: number | null
  zip: string | null
}

export type IntelligenceRowStatus = 'Active' | 'Pending' | 'New' | 'Reduced'

type SnapshotBenchmarks = {
  medianPrice: number | null
  avgPpsf: number | null
  medianSqft: number | null
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

function daysBetween(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType)
}

function isCommercialType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType)
}

function deriveStatus(
  listing: Listing,
  daysOnMarket: number | null,
  priceReductionPercent: number | null,
): IntelligenceRowStatus {
  const status = listing.status?.toLowerCase() ?? ''
  if (status === 'pending') return 'Pending'
  if (status === 'coming soon' || status === 'cs') return 'New'
  if ((priceReductionPercent ?? 0) > 1) return 'Reduced'
  if ((daysOnMarket ?? 99) <= 7) return 'New'
  return 'Active'
}

function listingToDisplayRow(listing: Listing, town: TmreTown): IntelligenceDisplayListing | null {
  if (listing.price == null || listing.price <= 0) return null
  const rental = isRentalType(listing.propertyType)
  const commercial = isCommercialType(listing.propertyType)
  const daysOnMarket =
    listing.dom != null ? listing.dom : daysBetween(listing.listDate ?? listing.modificationTimestamp)
  const pricePerSqft =
    !rental && listing.price && listing.sqft && listing.sqft > 0
      ? listing.price / listing.sqft
      : null
  const priceReductionPercent =
    listing.originalListPrice &&
    listing.price &&
    listing.originalListPrice > 0 &&
    listing.originalListPrice !== listing.price
      ? ((listing.originalListPrice - listing.price) / listing.originalListPrice) * 100
      : null

  return {
    key: listing.listingKey || listing.mlsId,
    address: listing.address.street || listing.address.full,
    city: town,
    price: listing.price,
    pricePerSqft,
    sqft: listing.sqft,
    dom: daysOnMarket,
    status: deriveStatus(listing, daysOnMarket, priceReductionPercent),
    isRental: rental,
    isCommercial: commercial,
    propertyType: listing.propertyType,
    yearBuilt: listing.yearBuilt,
    beds: listing.beds,
    baths: listing.baths,
    zip: listing.address.postalCode ?? null,
  }
}

function filterIntelligenceListings(rows: IntelligenceDisplayListing[]): IntelligenceDisplayListing[] {
  return rows.filter((l) => {
    if (l.isRental) return false
    if (l.isCommercial) return false
    return true
  })
}

function computeMonthsSupply(
  listingCount: number,
  avgMonthlySales: number | null | undefined,
): number | null {
  if (!avgMonthlySales || avgMonthlySales <= 0) return null
  return listingCount / avgMonthlySales
}

function formatSnapshotPrice(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

function formatSnapshotSqft(n: number | null): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function formatAvgBedrooms(avg: number | null): string {
  if (avg == null || !Number.isFinite(avg) || avg <= 0) return '—'
  const low = Math.floor(avg)
  const high = Math.ceil(avg)
  if (low === high || Math.abs(avg - low) < 0.05) {
    return low === 1 ? '1 bedroom' : `${low} bedrooms`
  }
  return `${low}-${high} bedrooms`
}

function supplyValueSignal(monthsSupply: number | null): SnapshotValueSignal {
  if (monthsSupply == null) return 'normal'
  if (monthsSupply <= 2) return 'bad'
  if (monthsSupply > 4) return 'good'
  return 'normal'
}

function domValueSignal(medDom: number | null): SnapshotValueSignal {
  if (medDom == null) return 'normal'
  if (medDom <= 10) return 'bad'
  if (medDom >= 25) return 'good'
  return 'normal'
}

function priceValueSignal(value: number | null, benchmark: number | null): SnapshotValueSignal {
  if (value == null || benchmark == null || benchmark <= 0) return 'normal'
  const ratio = value / benchmark
  if (ratio >= 1.12) return 'bad'
  if (ratio <= 0.88) return 'good'
  return 'normal'
}

function snapshotBenchmarks(rows: IntelligenceDisplayListing[]): SnapshotBenchmarks {
  const prices = rows.map((l) => l.price).filter((p): p is number => p > 0)
  const ppsfs = rows
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0)
  const sqfts = rows
    .filter((l) => !l.isCommercial && l.sqft != null && l.sqft > 0)
    .map((l) => l.sqft as number)
  return {
    medianPrice: median(prices),
    avgPpsf: average(ppsfs),
    medianSqft: median(sqfts),
  }
}

function isNewThisWeek(l: IntelligenceDisplayListing): boolean {
  return l.dom != null && l.dom <= 7
}

function avgMonthlySalesFromPayload(data: { year: number; month: number; count: number }[]): number | null {
  const now = new Date()
  const recentMonths: number[] = []
  for (let offset = 1; offset <= 3; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const yr = date.getFullYear()
    const mo = date.getMonth() + 1
    const entry = data.find((e) => e.year === yr && e.month === mo)
    if (entry) recentMonths.push(entry.count)
  }
  if (!recentMonths.length) return null
  return recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length
}

function buildTownSnapshot(
  townListings: IntelligenceDisplayListing[],
  town: string,
  monthlySales: Record<string, number>,
  benchmarks: SnapshotBenchmarks,
  closedThisWeekCount: number,
): IntelligenceTownSnapshot {
  const prices = townListings.map((l) => l.price).filter((p): p is number => p > 0)
  const doms = townListings.map((l) => l.dom).filter((d): d is number => d != null && d >= 0)
  const ppsfs = townListings
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0)
  const sqfts = townListings
    .filter((l) => !l.isCommercial && l.sqft != null && l.sqft > 0)
    .map((l) => l.sqft as number)
  const bedCounts = townListings
    .filter((l) => !l.isCommercial && l.beds != null && l.beds > 0)
    .map((l) => l.beds as number)
  const newListings = townListings.filter(isNewThisWeek).length
  const reduced = townListings.filter((l) => l.status === 'Reduced').length

  const medPrice = median(prices)
  const medDom = median(doms)
  const medSqft = median(sqfts)
  const avgPpsf = average(ppsfs)
  const avgBeds = average(bedCounts)

  const avgMonthlySales = monthlySales[town] ?? null
  const monthsSupply = computeMonthsSupply(townListings.length, avgMonthlySales)
  const supplyTone = monthsSupply == null ? 'flat' : monthsSupply <= 2 ? 'down' : monthsSupply <= 4 ? 'flat' : 'up'
  const supplyTrend =
    monthsSupply == null
      ? 'No sales data yet'
      : monthsSupply <= 2
        ? "Seller's market"
        : monthsSupply <= 4
          ? 'Balanced market'
          : "Buyer's market"
  const supplySignal = supplyValueSignal(monthsSupply)
  const domSignal = domValueSignal(medDom)
  const priceSignal = priceValueSignal(medPrice, benchmarks.medianPrice)
  const ppsfSignal = priceValueSignal(avgPpsf, benchmarks.avgPpsf)

  const metrics: SnapshotMetric[] = [
    {
      label: 'Listings',
      value: String(townListings.length),
      trend: `${newListings} new this week`,
      tone: newListings > 0 ? 'up' : 'flat',
      valueSignal: supplySignal,
      action: newListings > 0 ? 'new' : undefined,
    },
    {
      label: 'Reduced!',
      value: String(reduced),
      trend: reduced > 0 ? 'Price cut active' : 'No reductions',
      tone: reduced > 0 ? 'down' : 'flat',
      valueSignal: reduced > 0 ? 'good' : 'normal',
      action: reduced > 0 ? 'reduced' : undefined,
    },
    {
      label: 'Closed(s) this week',
      value: String(closedThisWeekCount),
      trend: closedThisWeekCount > 0 ? 'Past 7 days' : 'None this week',
      tone: closedThisWeekCount > 0 ? 'up' : 'flat',
      action: closedThisWeekCount > 0 ? 'closed' : undefined,
    },
    {
      label: 'Median price',
      value: formatSnapshotPrice(medPrice),
      trend: medPrice ? `${formatSnapshotPrice(medPrice)} median` : '—',
      tone: 'flat',
      valueSignal: priceSignal,
      linkMedian: medPrice != null && townListings.length > 0,
    },
    {
      label: 'Median sqft',
      value: formatSnapshotSqft(medSqft),
      trend:
        medSqft != null && benchmarks.medianSqft != null
          ? medSqft >= benchmarks.medianSqft
            ? 'Above market median'
            : 'Below market median'
          : medSqft != null
            ? `${formatSnapshotSqft(medSqft)} sqft`
            : 'No sqft data',
      tone: 'flat',
    },
    {
      label: 'Median DOM',
      value: medDom != null ? `${Math.round(medDom)}d` : '—',
      trend:
        medDom != null && medDom <= 10
          ? 'Moving fast'
          : medDom != null && medDom <= 20
            ? 'Steady pace'
            : townListings.length
              ? 'Slower market'
              : '—',
      tone: medDom != null && medDom <= 10 ? 'up' : medDom != null && medDom <= 20 ? 'flat' : 'down',
      valueSignal: domSignal,
    },
    {
      label: 'Avg bedrooms',
      value: formatAvgBedrooms(avgBeds),
      trend: avgBeds != null ? `${avgBeds.toFixed(1)} avg` : 'No bed data',
      tone: 'flat',
    },
    {
      label: 'Months supply',
      value: monthsSupply != null ? monthsSupply.toFixed(1) : '—',
      trend: supplyTrend,
      tone: supplyTone,
      valueSignal: supplySignal,
    },
    {
      label: 'Avg $/sqft',
      value: avgPpsf ? `$${Math.round(avgPpsf)}` : '—',
      trend: 'Non-rental only',
      tone: 'flat',
      valueSignal: ppsfSignal,
    },
  ]

  return {
    town,
    zip: null,
    title: formatTownZipPlace(town, null),
    metrics,
    stats: {
      town,
      listingCount: townListings.length,
      medianPrice: medPrice,
      medianDom: medDom,
      monthsSupply,
      newThisWeek: newListings,
      reduced,
      closedThisWeek: closedThisWeekCount,
      medianSqft: medSqft,
    },
  }
}

export const TOWN_SNAPSHOT_CACHE_PREFIX = 'intelligence-town-snapshot:v1'

export function townSnapshotCacheKey(town: TmreTown): string {
  return `${TOWN_SNAPSHOT_CACHE_PREFIX}:${town}`
}

async function salesPayloadForTown(town: TmreTown): Promise<SalesByMonthPayload | null> {
  // Read stats_cache directly — avoid importing stats-cache (circular with rebuild hook).
  const row = await readStatsCacheRow(statsCacheKey('sales-by-month', town, 'sale'))
  if (!row) return null
  try {
    const cached = JSON.parse(row.payload) as SalesByMonthPayload
    return cached?.data ? cached : null
  } catch {
    return null
  }
}

async function loadTownDisplayListings(town: TmreTown): Promise<IntelligenceDisplayListing[]> {
  const fromDb = await readListingsFromDb(town, 'Active', 500)
  if (fromDb.length > 0) {
    return fromDb
      .map((listing) => listingToDisplayRow(listing, town))
      .filter((row): row is IntelligenceDisplayListing => row != null)
  }
  const { listings } = await fetchActiveListingsForCity(town, 250)
  return listings
    .map((listing) => listingToDisplayRow(listing, town))
    .filter((row): row is IntelligenceDisplayListing => row != null)
}

/**
 * Build every TMRE town market snapshot from local SQLite + sales-by-month
 * stats_cache rows, then persist into stats_cache for instant Latest reads.
 */
export async function rebuildIntelligenceTownSnapshots(): Promise<{
  written: number
  durationMs: number
}> {
  const t0 = Date.now()
  const allRows: IntelligenceDisplayListing[] = []
  const monthlySales: Record<string, number> = {}
  const closedThisWeekByTown: Record<string, number> = {}

  for (const town of TMRE_TOWNS) {
    const rows = filterIntelligenceListings(
      (await readListingsFromDb(town, 'Active', 500))
        .map((listing) => listingToDisplayRow(listing, town))
        .filter((row): row is IntelligenceDisplayListing => row != null),
    )
    allRows.push(...rows)

    const cachedSupply = await readMonthsSupplyCached(town, 'sale', 'all')
    if (cachedSupply?.avgMonthlyClosings != null) {
      monthlySales[town] = cachedSupply.avgMonthlyClosings
    }

    const fromStats = await salesPayloadForTown(town)
    if (fromStats) {
      if (!(town in monthlySales)) {
        const avg = avgMonthlySalesFromPayload(fromStats.data)
        if (avg != null) monthlySales[town] = avg
      }
      closedThisWeekByTown[town] = fromStats.closedThisWeek ?? 0
      continue
    }

    try {
      const closed = await readListingsFromDb(town, 'Closed', 2500)
      const salesPayload = computeSalesByMonth(closed, town, 'sale')
      if (!(town in monthlySales)) {
        const avg = avgMonthlySalesFromPayload(salesPayload.data)
        if (avg != null) monthlySales[town] = avg
      }
      closedThisWeekByTown[town] = salesPayload.closedThisWeek
    } catch {
      closedThisWeekByTown[town] = 0
    }
  }

  const benchmarks = snapshotBenchmarks(allRows)
  let written = 0

  for (const town of TMRE_TOWNS) {
    const townListings = filterIntelligenceListings(
      allRows.filter((row) => row.city === town),
    )
    const snapshot = buildTownSnapshot(
      townListings,
      town,
      monthlySales,
      benchmarks,
      closedThisWeekByTown[town] ?? 0,
    )
    await writeStatsCacheRow(townSnapshotCacheKey(town), {
      snapshot,
      generatedAt: new Date().toISOString(),
    })
    snapshotCache.set(town, {
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      snapshot,
    })
    written += 1
  }

  setSyncMeta('last_town_snapshots', new Date().toISOString())
  console.info(
    `[town-snapshots] rebuilt ${written} entries in ${Date.now() - t0}ms`,
  )
  return { written, durationMs: Date.now() - t0 }
}

export async function readCachedIntelligenceTownSnapshot(
  townInput: string,
): Promise<IntelligenceTownSnapshot | null> {
  if (!isTmreTown(townInput)) return null

  const mem = snapshotCache.get(townInput)
  if (mem && mem.expiresAt > Date.now()) return mem.snapshot

  const row = await readStatsCacheRow(townSnapshotCacheKey(townInput))
  if (!row) return null
  try {
    const parsed = JSON.parse(row.payload) as {
      snapshot?: IntelligenceTownSnapshot
    }
    if (!parsed.snapshot?.town) return null
    snapshotCache.set(townInput, {
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      snapshot: parsed.snapshot,
    })
    return parsed.snapshot
  } catch {
    return null
  }
}

export async function readAllCachedIntelligenceTownSnapshots(): Promise<IntelligenceTownSnapshot[]> {
  const out: IntelligenceTownSnapshot[] = []
  for (const town of TMRE_TOWNS) {
    const snapshot = await readCachedIntelligenceTownSnapshot(town)
    if (snapshot) out.push(snapshot)
  }
  return out
}

export async function getIntelligenceTownSnapshot(
  townInput: string,
): Promise<IntelligenceTownSnapshot | null> {
  if (!isTmreTown(townInput)) return null

  const cached = await readCachedIntelligenceTownSnapshot(townInput)
  if (cached) return cached

  // Cache miss — rebuild all town snapshots once from SQLite, then re-read.
  try {
    await rebuildIntelligenceTownSnapshots()
  } catch (err) {
    console.error('[town-snapshots] rebuild on miss failed', err)
  }
  return readCachedIntelligenceTownSnapshot(townInput)
}

/** @deprecated Prefer rebuildIntelligenceTownSnapshots + read from stats_cache. */
export async function computeIntelligenceTownSnapshotLive(
  townInput: string,
): Promise<IntelligenceTownSnapshot | null> {
  if (!isTmreTown(townInput)) return null

  const allRows: IntelligenceDisplayListing[] = []
  const monthlySales: Record<string, number> = {}
  let closedThisWeekCount = 0

  await Promise.all(
    TMRE_TOWNS.map(async (town) => {
      const rows = filterIntelligenceListings(await loadTownDisplayListings(town))
      allRows.push(...rows)

      try {
        const fromStats = await salesPayloadForTown(town)
        if (fromStats) {
          const avg = avgMonthlySalesFromPayload(fromStats.data)
          if (avg != null) monthlySales[town] = avg
          if (town === townInput) closedThisWeekCount = fromStats.closedThisWeek ?? 0
          return
        }

        const closedDb = await readListingsFromDb(town, 'Closed', 2500)
        const closed =
          closedDb.length > 0
            ? closedDb
            : (await fetchClosedListingsForCity(town, 2500)).listings
        const salesPayload = computeSalesByMonth(closed, town, 'sale')
        const avg = avgMonthlySalesFromPayload(salesPayload.data)
        if (avg != null) monthlySales[town] = avg
        if (town === townInput) closedThisWeekCount = salesPayload.closedThisWeek
      } catch {
        // keep defaults
      }
    }),
  )

  const benchmarks = snapshotBenchmarks(allRows)
  const townListings = filterIntelligenceListings(
    allRows.filter((row) => row.city === townInput),
  )

  return buildTownSnapshot(
    townListings,
    townInput,
    monthlySales,
    benchmarks,
    closedThisWeekCount,
  )
}
