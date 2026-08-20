import {
  listingRowId,
  readListingScoresByIds,
  readListingsDbStats,
  readStatsListingsFromDb,
} from '@/lib/db/listings-repo'
import { readMarketStatsPools } from '@/lib/db/stats-aggregates-repo'
import {
  deleteSyncMetaDurable,
  getSyncMeta,
  releaseTimedLock,
  setSyncMetaDurable,
  tryAcquireTimedLock,
} from '@/lib/db/sync-meta-store'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { beginListingsRefresh, endListingsRefresh } from '@/lib/listings-refresh-status'
import { hasLocalListingsCache } from '@/lib/listings-store'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  computeActiveByMonth,
  computeAvgScoreByVintage,
  computeMarketStats,
  computeActiveByPrice,
  computeActiveBySegmentPrice,
  inventorySegmentStatsScope,
  computeSalesByMonth,
  computeSalesByPrice,
  computeSalesByVintage,
  computeWentToContractThisWeekCounts,
  marketStatsFromPools,
  rollupActiveByPrice,
  rollupActiveBySegmentPrice,
  rollupAvgScoreByVintage,
  rollupSalesByPrice,
  rollupSalesByVintage,
  statsCacheKey,
  type ActiveByMonthByTownPayload,
  type ActiveByPricePayload,
  type ActiveBySegmentPricePayload,
  type AvgScoreByVintageByTownPayload,
  type AvgScoreByVintagePayload,
  type SalesByMonthByTownPayload,
  type SalesByPricePayload,
  type SalesByVintagePayload,
  type StatsCacheScope,
} from '@/lib/stats-compute'
import {
  listingToStatsRow,
  STATS_CLOSED_PERIOD_START,
  type StatsListingRow,
} from '@/lib/stats-listing-rows'
import { STATS_MONTH_CHART_START_YEAR, statsMonthChartYears } from '@/lib/stats-month-years'
import type { Listing } from '@/lib/rets'
import type { StatsRebuildReason } from '@/lib/stats-dirty-towns'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import { rebuildIntelligenceTownSnapshots } from '@/lib/intelligence-town-snapshot'
import { refreshInterestingStat } from '@/lib/interesting-stat'
import { rebuildTownZipsCache } from '@/lib/town-zips-cache'
import { getPriceBucketsFresh } from '@/lib/price-buckets-config'
import {
  getInventorySegmentBandsConfigFresh,
} from '@/lib/inventory-segment-bands-config'
import { INVENTORY_SEGMENT_IDS } from '@/lib/inventory-segment-bands-shared'
import type { PriceBucketDef } from '@/lib/price-buckets-shared'
import {
  finalizeMonthsSupplyCache,
  MONTHS_SUPPLY_INDEX_KEY,
  writeMonthsSupplyForTown,
} from '@/lib/months-supply-cache'
import { rebuildMarketPulseClosedCache } from '@/lib/market-pulse-closed-cache'
import {
  SqliteWriteStatsCollector,
  type TableWriteStats,
} from '@/lib/sqlite-sync-stats'

/**
 * Age at which a payload is *reported* old (Stats API meta, Admin readouts).
 * Rebuilds are driven by dirty towns (lib/stats-dirty-towns.ts), not by this.
 */
export const STATS_CACHE_TTL_MS = 60 * 60 * 1000

/**
 * How often a host checks for dirty towns. The check is one small sync_meta
 * read; it only turns into work when the incremental sync marked something.
 */
export const STATS_CACHE_SWEEP_MS = 10 * 60 * 1000

/** sync_meta key — ISO start time while a stats_cache rebuild holds the lock. */
export const STATS_CACHE_REBUILD_LOCK_KEY = 'stats_cache_rebuild_lock'

/** Steal the rebuild lock if the holder has been silent this long (dead Lambda). */
export const STATS_CACHE_REBUILD_LOCK_STALE_MS = 20 * 60 * 1000

/**
 * Liveness for the rebuild lock.
 *
 * The lock value is the acquire time, so a holder that is frozen mid-rebuild
 * (serverless invocation ends, process killed) used to keep every other host out
 * for the full 20 minutes — and each doomed retry re-armed it, which is how the
 * stats rebuild deadlocked itself indefinitely. A live holder stamps this key
 * while it works; a dead one stops instantly, so the lock frees in minutes.
 */
export const STATS_CACHE_REBUILD_HEARTBEAT_KEY = 'stats_cache_rebuild_heartbeat'
const STATS_CACHE_REBUILD_HEARTBEAT_EVERY_MS = 45 * 1000
const STATS_CACHE_REBUILD_HEARTBEAT_STALE_MS = 3 * 60 * 1000

/** ISO time — do not POST sync-stats-cache-worker again until then (Netlify 429). */
export const STATS_CACHE_QUEUE_BACKOFF_KEY = 'stats_cache_queue_backoff_until'
export const STATS_CACHE_QUEUE_BACKOFF_MS = 15 * 60 * 1000

function parseMetaMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** True only while the lock holder is still stamping its heartbeat. */
async function rebuildLockHolderIsAlive(now = Date.now()): Promise<boolean> {
  const { getSyncMeta: getFresh } = await import('@/lib/db/sync-meta')
  const beatMs = parseMetaMs(await getFresh(STATS_CACHE_REBUILD_HEARTBEAT_KEY))
  if (beatMs == null) return false
  return now - beatMs < STATS_CACHE_REBUILD_HEARTBEAT_STALE_MS
}

/**
 * Host-agnostic: is a rebuild genuinely in flight right now? Used before asking
 * any host (Railway or Netlify) to start one.
 */
export async function reasonToSkipStatsCacheRebuild(
  now = Date.now(),
): Promise<string | null> {
  const { getSyncMeta: getFresh } = await import('@/lib/db/sync-meta')

  const lockMs = parseMetaMs(await getFresh(STATS_CACHE_REBUILD_LOCK_KEY))
  if (
    lockMs != null &&
    now - lockMs < STATS_CACHE_REBUILD_LOCK_STALE_MS &&
    (await rebuildLockHolderIsAlive(now))
  ) {
    return 'skipped — stats rebuild already running'
  }

  const startedMs = parseMetaMs(await getFresh('last_stats_cache_started'))
  const finishedMs = parseMetaMs(await getFresh('last_stats_cache'))
  if (
    startedMs != null &&
    now - startedMs < STATS_CACHE_REBUILD_LOCK_STALE_MS &&
    (finishedMs == null || startedMs > finishedMs) &&
    (await rebuildLockHolderIsAlive(now))
  ) {
    return 'skipped — stats worker already started'
  }

  return null
}

/** Netlify-only: the background worker hop is in its 429 backoff window. */
export async function isStatsCacheQueueBackedOff(
  now = Date.now(),
): Promise<boolean> {
  const { getSyncMeta: getFresh } = await import('@/lib/db/sync-meta')
  const backoffMs = parseMetaMs(await getFresh(STATS_CACHE_QUEUE_BACKOFF_KEY))
  return backoffMs != null && backoffMs > now
}

/** Skip enqueue when a rebuild is live or Netlify just 429'd the worker hop. */
export async function reasonToSkipStatsCacheEnqueue(
  now = Date.now(),
): Promise<string | null> {
  if (await isStatsCacheQueueBackedOff(now)) {
    return 'skipped — Netlify rate limited (HTTP 429), waiting to retry'
  }
  return reasonToSkipStatsCacheRebuild(now)
}

export async function stampStatsCacheQueueBackoff(now = Date.now()): Promise<void> {
  await setSyncMetaDurable(
    STATS_CACHE_QUEUE_BACKOFF_KEY,
    new Date(now + STATS_CACHE_QUEUE_BACKOFF_MS).toISOString(),
  )
}

let emptyCacheRebuildAttempted = false
let backgroundRebuildScheduled = false

type KindTownMonthData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>
>
type KindTownActiveMonthData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>
>
type KindTownAvgScoreData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, AvgScoreByVintagePayload>
>

function emptyKindTownMonthData(): KindTownMonthData {
  return {
    sale: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
  }
}

function emptyKindTownActiveMonthData(): KindTownActiveMonthData {
  return {
    sale: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
  }
}

function emptyKindTownAvgScoreData(): KindTownAvgScoreData {
  return {
    sale: {} as Record<TmreTown, AvgScoreByVintagePayload>,
    rental: {} as Record<TmreTown, AvgScoreByVintagePayload>,
  }
}

async function acquireStatsCacheRebuildLock(force = false): Promise<string | null> {
  const token = new Date().toISOString()
  // force=0ms stale window steals any prior holder (admin / background heal).
  let staleAfterMs = force ? 0 : STATS_CACHE_REBUILD_LOCK_STALE_MS
  if (!force && !(await rebuildLockHolderIsAlive())) {
    // Holder stopped heart-beating — do not wait out the full stale window.
    staleAfterMs = 0
  }
  const ok = await tryAcquireTimedLock(
    STATS_CACHE_REBUILD_LOCK_KEY,
    token,
    staleAfterMs,
  )
  if (!ok) {
    console.info('[stats-cache] skipped — rebuild lock held')
    return null
  }
  // Stamp before returning so a racing acquirer never sees us as dead.
  await setSyncMetaDurable(STATS_CACHE_REBUILD_HEARTBEAT_KEY, token)
  return token
}

/** Keep the lock alive while we work. Returns the stop function. */
function startStatsCacheRebuildHeartbeat(): () => void {
  const timer = setInterval(() => {
    void setSyncMetaDurable(
      STATS_CACHE_REBUILD_HEARTBEAT_KEY,
      new Date().toISOString(),
    ).catch(() => {
      /* heartbeat is best-effort; a miss only shortens our lease */
    })
  }, STATS_CACHE_REBUILD_HEARTBEAT_EVERY_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}

async function releaseStatsCacheRebuildLock(token: string | null): Promise<void> {
  if (!token) return
  try {
    await releaseTimedLock(STATS_CACHE_REBUILD_LOCK_KEY, token)
    await deleteSyncMetaDurable(STATS_CACHE_REBUILD_HEARTBEAT_KEY)
  } catch (err) {
    console.error('[stats-cache] failed to release rebuild lock', err)
  }
}

type MonthlyCount = { year: number; month: number; count: number }

function aggregateMonthCounts(
  rows: MonthlyCount[][],
  years: readonly number[],
): MonthlyCount[] {
  const totals = new Map<string, number>()
  for (const data of rows) {
    for (const { year, month, count } of data) {
      const key = `${year}-${month}`
      totals.set(key, (totals.get(key) ?? 0) + count)
    }
  }
  const combined: MonthlyCount[] = []
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      combined.push({ year, month, count: totals.get(`${year}-${month}`) ?? 0 })
    }
  }
  return combined
}

export async function readAggregatedSalesByMonth(
  kind: ListingKind,
): Promise<(ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }) | null> {
  const rows: MonthlyCount[][] = []
  let generatedAt: string | undefined
  for (const town of TMRE_TOWNS) {
    const cached = await readStatsCache<ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }>(
      'sales-by-month',
      town,
      kind,
    )
    if (!cached?.data?.length) continue
    rows.push(cached.data)
    generatedAt = cached.generatedAt ?? generatedAt
  }
  if (!rows.length) return null
  return {
    city: 'All',
    kind,
    data: aggregateMonthCounts(rows, statsMonthChartYears()),
    closedThisWeek: 0,
    closedThisWeekByZip: {},
    closedThisWeekVolume: 0,
    closedLast4Weeks: 0,
    closedLast4WeeksVolume: 0,
    wentToContractThisWeek: 0,
    wentToContractThisWeekByZip: {},
    generatedAt,
  }
}

export async function readAggregatedActiveByMonth(
  kind: ListingKind,
): Promise<(ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }) | null> {
  const rows: MonthlyCount[][] = []
  let generatedAt: string | undefined
  for (const town of TMRE_TOWNS) {
    const cached = await readStatsCache<ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }>(
      'active-by-month',
      town,
      kind,
    )
    if (!cached?.data?.length) continue
    rows.push(cached.data)
    generatedAt = cached.generatedAt ?? generatedAt
  }
  if (!rows.length) return null
  return {
    city: 'All',
    kind,
    data: aggregateMonthCounts(rows, statsMonthChartYears()),
    generatedAt,
  }
}

export function getStatsCacheAgeMs(): number | null {
  const ts = getSyncMeta('last_stats_cache')
  if (!ts) return null
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return null
  return Date.now() - ms
}

/**
 * Age-only signal, kept for the "cache age" readouts (Stats API meta, Admin).
 * No longer a rebuild trigger — rebuilds follow dirty towns, not the clock.
 */
export function isStatsCacheStale(): boolean {
  const age = getStatsCacheAgeMs()
  if (age == null) return true
  return age >= STATS_CACHE_TTL_MS
}

/** Month comparison charts — both persisted per town × kind in stats_cache. */
const MONTH_CHART_CACHE_SCOPES = ['sales-by-month', 'active-by-month'] as const satisfies readonly StatsCacheScope[]

function monthChartPayloadCurrent(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as { data?: { year: number }[] }
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return false
    const years = new Set(parsed.data.map((d) => d.year))
    return years.has(STATS_MONTH_CHART_START_YEAR)
  } catch {
    return false
  }
}

async function statsCacheMissingMedians(): Promise<boolean> {
  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      const row = await readStatsCacheRow(statsCacheKey('market-stats', town, kind))
      if (!row) return true
      try {
        const payload = JSON.parse(row.payload) as { medianPrice?: number | null }
        if (payload.medianPrice == null) return true
      } catch {
        return true
      }
    }
  }
  return false
}

async function statsCacheMissingMonthCharts(): Promise<boolean> {
  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      for (const scope of MONTH_CHART_CACHE_SCOPES) {
        const row = await readStatsCacheRow(statsCacheKey(scope, town, kind))
        if (!row) return true
        if (!monthChartPayloadCurrent(row.payload)) return true
      }
    }
  }
  return false
}

async function statsCacheMissingMonthsSupply(): Promise<boolean> {
  const row = await readStatsCacheRow(MONTHS_SUPPLY_INDEX_KEY)
  return row == null
}

async function statsCacheMissingRequiredEntries(): Promise<boolean> {
  return (
    (await statsCacheMissingMedians()) ||
    (await statsCacheMissingMonthCharts()) ||
    (await statsCacheMissingMonthsSupply())
  )
}

async function ensureStatsCachePopulated(): Promise<void> {
  if (emptyCacheRebuildAttempted || !(await hasLocalListingsCache())) return
  const { total, statsCacheEntries } = await readListingsDbStats()
  if (total > 0 && (statsCacheEntries === 0 || (await statsCacheMissingRequiredEntries()))) {
    emptyCacheRebuildAttempted = true
    scheduleStatsCacheRebuildIfStale(true)
  }
}

export async function readStatsCache<T>(
  scope: StatsCacheScope,
  city: string,
  kind: ListingKind,
): Promise<T | null> {
  if (!(await hasLocalListingsCache())) return null
  await ensureStatsCachePopulated()
  const row = await readStatsCacheRow(statsCacheKey(scope, city, kind))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

export async function writeStatsCache(
  scope: StatsCacheScope,
  city: string,
  kind: ListingKind,
  payload: unknown,
): Promise<void> {
  await writeStatsCacheRow(statsCacheKey(scope, city, kind), payload)
}

export async function readSalesByMonthByTown(
  kind: ListingKind,
): Promise<(SalesByMonthByTownPayload & { generatedAt?: string }) | null> {
  return readStatsCache('sales-by-month-by-town', 'All', kind)
}

export async function readActiveByMonthByTown(
  kind: ListingKind,
): Promise<(ActiveByMonthByTownPayload & { generatedAt?: string }) | null> {
  return readStatsCache('active-by-month-by-town', 'All', kind)
}

export async function readSalesByMonth(
  city: string,
  kind: ListingKind,
): Promise<(ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }) | null> {
  return readStatsCache('sales-by-month', city, kind)
}

export async function readActiveByMonth(
  city: string,
  kind: ListingKind,
): Promise<(ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }) | null> {
  return readStatsCache('active-by-month', city, kind)
}

export async function readAvgScoreByVintage(
  city: string,
  kind: ListingKind,
): Promise<(AvgScoreByVintagePayload & { generatedAt?: string }) | null> {
  return readStatsCache('avg-score-by-vintage', city, kind)
}

/**
 * Recompute Active Goldilocks averages by vintage (per town + All + by-town
 * bundle). Safe to call after listing scores change without clearing the rest
 * of stats_cache.
 */
export async function rebuildAvgScoreByVintageCache(): Promise<{
  written: number
  durationMs: number
}> {
  const t0 = Date.now()
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0 }
  }

  let written = 0
  const generatedAt = new Date().toISOString()
  const byTown: Record<
    (typeof LISTING_KINDS)[number],
    Record<TmreTown, AvgScoreByVintagePayload>
  > = {
    sale: {} as Record<TmreTown, AvgScoreByVintagePayload>,
    rental: {} as Record<TmreTown, AvgScoreByVintagePayload>,
  }

  for (const town of TMRE_TOWNS) {
    // Uncapped: All is rolled up from these town payloads.
    const active = await readStatsListingsFromDb(town, 'Active')
    const scoredActive = await scoredActiveRows(active)
    for (const kind of LISTING_KINDS) {
      const payload = computeAvgScoreByVintage(scoredActive, town, kind)
      await writeStatsCache('avg-score-by-vintage', town, kind, {
        ...payload,
        generatedAt,
      })
      byTown[kind][town] = payload
      written += 1
    }
  }

  for (const kind of LISTING_KINDS) {
    await writeStatsCache('avg-score-by-vintage-by-town', 'All', kind, {
      kind,
      towns: byTown[kind],
      generatedAt,
    })
    // Counts and weighted averages combine, so All comes from the town payloads
    // just computed — no second pass over every Active listing in the market.
    await writeStatsCache('avg-score-by-vintage', 'All', kind, {
      ...rollupAvgScoreByVintage(Object.values(byTown[kind]), 'All', kind),
      generatedAt,
    })
    written += 2
  }

  console.info(
    `[stats-cache] avg-score-by-vintage rebuilt ${written} entries in ${Date.now() - t0}ms`,
  )
  return { written, durationMs: Date.now() - t0 }
}

async function scoredActiveRows(active: Listing[]): Promise<
  {
    yearBuilt: number | null
    goldilocksScore: number
    propertyType: string
    raw?: Record<string, string>
  }[]
> {
  const ids = active.map((l) => listingRowId(l)).filter(Boolean)
  const scoreMap = await readListingScoresByIds(ids)
  const out: {
    yearBuilt: number | null
    goldilocksScore: number
    propertyType: string
    raw?: Record<string, string>
  }[] = []
  for (const listing of active) {
    const id = listingRowId(listing)
    const score = id ? scoreMap.get(id)?.score : null
    if (score == null || !Number.isFinite(score)) continue
    out.push({
      yearBuilt: listing.yearBuilt,
      goldilocksScore: score,
      propertyType: listing.propertyType,
      raw: listing.raw,
    })
  }
  return out
}

export type TownStatsBundle = {
  marketStats: ReturnType<typeof computeMarketStats> & { generatedAt: string }
  vintage: ReturnType<typeof computeSalesByVintage> & { generatedAt: string }
  medianListings: StatsListingRow[]
}

/**
 * Planned Town stats catalogue (most current year we have) for Market Pulse
 * Buyer/Seller Friendly ratios — not persisted yet.
 * See lib/market-pulse-favorability.ts + glossary “Town housing unit count”.
 */
export type TownStatsHousingCatalogue = {
  /** Calendar year of the housing count source (e.g. ACS vintage). */
  housingYear: number
  housingUnits: number
  /** Closed sales in trailing 24 months (MLS), for ÷ housingUnits. */
  closedTrailing24Months: number
  generatedAt: string
}

function buildMedianListingRows(
  closed: Listing[],
  town: string,
  kind: ListingKind,
): StatsListingRow[] {
  return filterListingsByKind(closed, kind)
    .map((l) => listingToStatsRow(l, town, kind))
    .filter((row): row is StatsListingRow => row != null)
    .sort((a, b) => {
      const aMs = a.listDate ? Date.parse(a.listDate) : 0
      const bMs = b.listDate ? Date.parse(b.listDate) : 0
      return bMs - aMs
    })
}

/** Build stats page payloads from in-memory listing arrays (RETS fallback). */
export function computeTownBundleFromListings(
  town: string,
  kind: ListingKind,
  active: Listing[],
  closed: Listing[],
): TownStatsBundle {
  const generatedAt = new Date().toISOString()
  return {
    marketStats: { ...computeMarketStats(active, town, kind, closed), generatedAt },
    vintage: { ...computeSalesByVintage(closed, town, kind), generatedAt },
    medianListings: buildMedianListingRows(closed, town, kind),
  }
}

/** Upsert market scopes for one town; optionally fill by-town bundle maps. */
type InventorySegmentForCache = {
  id: 'value' | 'mid' | 'luxury' | 'discount'
  label: string
  min: number
  max: number | null
  steps: readonly PriceBucketDef[]
}

async function writeTownMarketStats(
  town: TmreTown,
  active: Listing[],
  closed: Listing[],
  generatedAt: string,
  saleBuckets: readonly PriceBucketDef[],
  inventorySegments: readonly InventorySegmentForCache[],
  bundles?: {
    salesByMonthByTown: KindTownMonthData
    activeByMonthByTown: KindTownActiveMonthData
    avgScoreByVintageByTown: KindTownAvgScoreData
  },
  /** Expired (and similar) history for seasonal active-by-month reconstruction. */
  offMarket: readonly Listing[] = [],
): Promise<number> {
  let written = 0
  const scoredActive = await scoredActiveRows(active)

  for (const kind of LISTING_KINDS) {
    await writeStatsCache('market-stats', town, kind, {
      ...computeMarketStats(active, town, kind, closed),
      generatedAt,
    })
    written += 1

    await writeStatsCache('market-stats-listings', town, kind, {
      listings: buildMedianListingRows(closed, town, kind),
      generatedAt,
    })
    written += 1

    const monthPayload = {
      ...computeSalesByMonth(closed, town, kind),
      ...computeWentToContractThisWeekCounts(active, kind),
    }
    await writeStatsCache('sales-by-month', town, kind, { ...monthPayload, generatedAt })
    if (bundles) bundles.salesByMonthByTown[kind][town] = monthPayload.data
    written += 1

    const activeMonthPayload = computeActiveByMonth(
      active,
      closed,
      town,
      kind,
      offMarket,
    )
    await writeStatsCache('active-by-month', town, kind, {
      ...activeMonthPayload,
      generatedAt,
    })
    if (bundles) bundles.activeByMonthByTown[kind][town] = activeMonthPayload.data
    written += 1

    await writeStatsCache('sales-by-vintage', town, kind, {
      ...computeSalesByVintage(closed, town, kind),
      generatedAt,
    })
    written += 1

    await writeStatsCache('sales-by-price', town, kind, {
      ...computeSalesByPrice(closed, town, kind, saleBuckets),
      generatedAt,
    })
    written += 1

    await writeStatsCache('active-by-price', town, kind, {
      ...computeActiveByPrice(active, town, kind, saleBuckets),
      generatedAt,
    })
    written += 1

    if (kind === 'sale') {
      for (const segment of inventorySegments) {
        await writeStatsCache(inventorySegmentStatsScope(segment.id), town, 'sale', {
          ...computeActiveBySegmentPrice(active, town, segment, saleBuckets),
          generatedAt,
        })
        written += 1
      }
    }

    const avgScorePayload = computeAvgScoreByVintage(scoredActive, town, kind)
    await writeStatsCache('avg-score-by-vintage', town, kind, {
      ...avgScorePayload,
      generatedAt,
    })
    if (bundles) bundles.avgScoreByVintageByTown[kind][town] = avgScorePayload
    written += 1
  }

  return written
}

async function writeByTownBundles(
  salesByMonthByTown: KindTownMonthData,
  activeByMonthByTown: KindTownActiveMonthData,
  avgScoreByVintageByTown: KindTownAvgScoreData,
  generatedAt: string,
): Promise<number> {
  let written = 0
  for (const kind of LISTING_KINDS) {
    await writeStatsCache('sales-by-month-by-town', 'All', kind, {
      kind,
      towns: salesByMonthByTown[kind],
      generatedAt,
    })
    await writeStatsCache('active-by-month-by-town', 'All', kind, {
      kind,
      towns: activeByMonthByTown[kind],
      generatedAt,
    })
    const avgBundle: AvgScoreByVintageByTownPayload = {
      kind,
      towns: avgScoreByVintageByTown[kind],
    }
    await writeStatsCache('avg-score-by-vintage-by-town', 'All', kind, {
      ...avgBundle,
      generatedAt,
    })
    written += 3
  }
  return written
}

async function readCachedJsonPayload<T>(cacheKey: string): Promise<T | null> {
  const row = await readStatsCacheRow(cacheKey)
  if (!row) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

/** Rebuild `*-by-town:All` bundles from per-town cache rows (after a partial town upsert). */
async function refreshByTownBundlesFromTownCaches(generatedAt: string): Promise<number> {
  const salesByMonthByTown = emptyKindTownMonthData()
  const activeByMonthByTown = emptyKindTownActiveMonthData()
  const avgScoreByVintageByTown = emptyKindTownAvgScoreData()

  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      const sales = await readCachedJsonPayload<ReturnType<typeof computeSalesByMonth>>(
        statsCacheKey('sales-by-month', town, kind),
      )
      if (sales?.data) salesByMonthByTown[kind][town] = sales.data

      const active = await readCachedJsonPayload<ReturnType<typeof computeActiveByMonth>>(
        statsCacheKey('active-by-month', town, kind),
      )
      if (active?.data) activeByMonthByTown[kind][town] = active.data

      const avg = await readCachedJsonPayload<AvgScoreByVintagePayload>(
        statsCacheKey('avg-score-by-vintage', town, kind),
      )
      if (avg) avgScoreByVintageByTown[kind][town] = avg
    }
  }

  return writeByTownBundles(
    salesByMonthByTown,
    activeByMonthByTown,
    avgScoreByVintageByTown,
    generatedAt,
  )
}

/**
 * Every town's cached payload for one scope + kind.
 *
 * Towns not rebuilt this cycle still have their previous row (stats_cache is
 * upserted, never wiped), so a per-town rebuild can still roll up a complete
 * All. A town missing entirely means the cache was never built for it, which
 * statsCacheMissingRequiredEntries() escalates to a full rebuild — log it and
 * roll up what exists rather than blocking the write.
 */
async function collectTownPayloads<T>(
  scope: StatsCacheScope,
  kind: ListingKind,
): Promise<T[]> {
  const parts: T[] = []
  const missing: string[] = []
  for (const town of TMRE_TOWNS) {
    const payload = await readCachedJsonPayload<T>(statsCacheKey(scope, town, kind))
    if (payload) parts.push(payload)
    else missing.push(town)
  }
  if (missing.length > 0) {
    console.warn(
      `[stats-cache] ${scope}:All:${kind} rolled up without ${missing.join(', ')} — no cached payload`,
    )
  }
  return parts
}

/**
 * Write the All-towns payloads.
 *
 * Nothing here reads listings. The additive payloads are summed from the
 * per-town rows this rebuild just wrote, and the one non-additive payload
 * (market-stats, which carries a median and three means) comes from a single
 * Postgres aggregate. Loading every Active and Closed listing in the market to
 * reduce them in Node is what exhausted V8's heap on Railway; that cost grew
 * with the market and did not belong in the process either way.
 */
async function writeAllAggregateStats(
  generatedAt: string,
  inventorySegments: readonly InventorySegmentForCache[],
): Promise<number> {
  let written = 0
  const periodEndYear = new Date().getFullYear()

  for (const kind of LISTING_KINDS) {
    // All-towns market stats: the only source for the Market Pulse avg-DOM
    // "All towns" bar (lib/market-digest.ts reads market-stats:All:{kind}).
    const pools = await readMarketStatsPools({
      towns: TMRE_TOWNS,
      kind,
      periodStartYear: STATS_CLOSED_PERIOD_START,
      periodEndYear,
    })
    await writeStatsCache('market-stats', 'All', kind, {
      ...marketStatsFromPools(pools, 'All', kind),
      generatedAt,
    })
    written += 1

    const vintageParts = await collectTownPayloads<SalesByVintagePayload>(
      'sales-by-vintage',
      kind,
    )
    if (vintageParts.length > 0) {
      await writeStatsCache('sales-by-vintage', 'All', kind, {
        ...rollupSalesByVintage(vintageParts, 'All', kind),
        generatedAt,
      })
      written += 1
    }

    const salesPriceParts = await collectTownPayloads<SalesByPricePayload>(
      'sales-by-price',
      kind,
    )
    if (salesPriceParts.length > 0) {
      await writeStatsCache('sales-by-price', 'All', kind, {
        ...rollupSalesByPrice(salesPriceParts, 'All', kind),
        generatedAt,
      })
      written += 1
    }

    const activePriceParts = await collectTownPayloads<ActiveByPricePayload>(
      'active-by-price',
      kind,
    )
    if (activePriceParts.length > 0) {
      await writeStatsCache('active-by-price', 'All', kind, {
        ...rollupActiveByPrice(activePriceParts, 'All', kind),
        generatedAt,
      })
      written += 1
    }

    if (kind === 'sale') {
      for (const segment of inventorySegments) {
        const scope = inventorySegmentStatsScope(segment.id)
        const segmentParts = await collectTownPayloads<ActiveBySegmentPricePayload>(
          scope,
          'sale',
        )
        if (segmentParts.length === 0) continue
        await writeStatsCache(scope, 'All', 'sale', {
          ...rollupActiveBySegmentPrice(segmentParts, 'All'),
          generatedAt,
        })
        written += 1
      }
    }

    const scoreParts = await collectTownPayloads<AvgScoreByVintagePayload>(
      'avg-score-by-vintage',
      kind,
    )
    if (scoreParts.length > 0) {
      await writeStatsCache('avg-score-by-vintage', 'All', kind, {
        ...rollupAvgScoreByVintage(scoreParts, 'All', kind),
        generatedAt,
      })
      written += 1
    }
  }
  return written
}

export type RebuildStatsSkipReason = 'lock' | 'no-listings' | 'not-stale' | 'empty-towns'

export type RebuildStatsResult = {
  written: number
  durationMs: number
  skipped?: boolean
  skipReason?: RebuildStatsSkipReason
}

export type RebuildStatsOptions = {
  trackRefresh?: boolean
  force?: boolean
  /** What asked for this rebuild — shown in Admin → Syncs. */
  trigger?: string
  /** Per-town reason from the dirty sweep, for the same panel. */
  reasons?: Record<string, StatsRebuildReason>
}

/**
 * Consume the dirty marks this rebuild covered and publish the "what ran and
 * why" line the Sync dashboard reads. Best-effort: bookkeeping must never fail
 * a rebuild that already wrote its payloads.
 */
async function finishStatsCacheRun(args: {
  towns: readonly TmreTown[]
  /** Rebuild start — marks newer than this stay dirty for the next sweep. */
  consumedThrough: string
  written: number
  durationMs: number
  trigger: string
  reasons?: Record<string, StatsRebuildReason>
  error?: string
}): Promise<void> {
  try {
    const { clearStatsTownsDirty, recordStatsCacheRun } = await import(
      '@/lib/stats-dirty-towns'
    )
    const at = new Date().toISOString()
    const ok = args.written > 0 && !args.error
    if (ok) {
      await clearStatsTownsDirty(args.towns, args.consumedThrough, at)
    }
    await recordStatsCacheRun({
      at,
      towns: [...args.towns],
      trigger: args.trigger,
      reasons: args.reasons,
      written: args.written,
      durationMs: args.durationMs,
      ok,
      error: args.error,
    })
  } catch (err) {
    console.error('[stats-cache] run bookkeeping failed', err)
  }
}

/**
 * Recompute Stats API payloads from listings and upsert into stats_cache.
 * Does not clear existing rows — failed mid-rebuild leaves prior payloads intact.
 * Pass `force: true` (admin / worker heal) to steal a stuck rebuild lock immediately.
 */
export async function rebuildStatsCache(
  options: RebuildStatsOptions = {},
): Promise<RebuildStatsResult> {
  const trackRefresh = options.trackRefresh !== false
  const lockToken = await acquireStatsCacheRebuildLock(options.force === true)
  if (!lockToken) {
    return { written: 0, durationMs: 0, skipped: true, skipReason: 'lock' }
  }
  const stopHeartbeat = startStatsCacheRebuildHeartbeat()

  if (trackRefresh) beginListingsRefresh('stats-cache')
  const startedAt = new Date().toISOString()
  // Durable: Admin dashboard End/Start must survive Lambda freeze after rebuild.
  await setSyncMetaDurable('last_stats_cache_started', startedAt)
  const t0 = Date.now()
  try {
    if (!(await hasLocalListingsCache())) {
      return {
        written: 0,
        durationMs: Date.now() - t0,
        skipped: true,
        skipReason: 'no-listings',
      }
    }

    let written = 0
    const generatedAt = new Date().toISOString()
    const saleBuckets = await getPriceBucketsFresh()
    const inventoryConfig = await getInventorySegmentBandsConfigFresh()
    const inventorySegments: InventorySegmentForCache[] =
      INVENTORY_SEGMENT_IDS.map((id) => {
        const s = inventoryConfig.segments.find((row) => row.id === id)!
        return {
          id: s.id,
          label: s.label,
          min: s.min,
          max: s.max,
          steps: s.steps.filter((b) => !b.hidden),
        }
      })
    const salesByMonthByTown = emptyKindTownMonthData()
    const activeByMonthByTown = emptyKindTownActiveMonthData()
    const avgScoreByVintageByTown = emptyKindTownAvgScoreData()

    for (const town of TMRE_TOWNS) {
      // No price-DESC caps here. Norwalk alone has ~5k closed; a 2500
      // high-price sample dropped nearly all recent mid-market closings and
      // inflated months-supply (e.g. June 2026 ≈ 174). Active is uncapped for
      // the same reason plus a new one: the All-towns payloads are now the sum
      // of these town payloads, so a 500-row cap would quietly shrink the whole
      // market's inventory count once a town outgrew it.
      const [active, closed, expired] = await Promise.all([
        readStatsListingsFromDb(town, 'Active'),
        readStatsListingsFromDb(town, 'Closed'),
        readStatsListingsFromDb(town, 'Expired'),
      ])
      written += await writeTownMarketStats(
        town,
        active,
        closed,
        generatedAt,
        saleBuckets,
        inventorySegments,
        {
          salesByMonthByTown,
          activeByMonthByTown,
          avgScoreByVintageByTown,
        },
        expired,
      )
      // While this town's listings are hot — nothing is retained past the
      // iteration, so peak heap is one town, not the whole market.
      written += await writeMonthsSupplyForTown(town, active, closed, generatedAt)
    }

    written += await writeByTownBundles(
      salesByMonthByTown,
      activeByMonthByTown,
      avgScoreByVintageByTown,
      generatedAt,
    )
    written += await writeAllAggregateStats(generatedAt, inventorySegments)

    try {
      const ms = await finalizeMonthsSupplyCache(generatedAt)
      written += ms.written
    } catch (err) {
      console.error('[stats-cache] months-supply rebuild failed', err)
    }

    try {
      const closed = await rebuildMarketPulseClosedCache()
      written += closed.written
    } catch (err) {
      console.error('[stats-cache] market-pulse closed rebuild failed', err)
    }

    // Only stamp End when something actually landed — empty writes must not
    // paint the Admin row green or advance Next.
    if (written > 0) {
      await setSyncMetaDurable('last_stats_cache', generatedAt)
    }
    console.info(`[stats-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`)

    try {
      const snap = await rebuildIntelligenceTownSnapshots()
      written += snap.written
    } catch (err) {
      console.error('[stats-cache] town snapshot rebuild failed', err)
    }

    try {
      const tz = await rebuildTownZipsCache()
      written += tz.written
    } catch (err) {
      console.error('[stats-cache] town-zips rebuild failed', err)
    }

    try {
      const { rebuildLatestTownUpdateStatsCache } = await import(
        '@/lib/latest-town-stats-cache'
      )
      const latestStats = await rebuildLatestTownUpdateStatsCache()
      written += latestStats.written
    } catch (err) {
      console.error('[stats-cache] latest town/zip stats rebuild failed', err)
    }

    try {
      const { rebuildClosedDailyCache } = await import('@/lib/closed-daily-cache')
      const closedDaily = await rebuildClosedDailyCache()
      written += closedDaily.written
    } catch (err) {
      console.error('[stats-cache] closed daily buckets rebuild failed', err)
    }

    try {
      if (await refreshInterestingStat(generatedAt)) written += 1
    } catch (err) {
      console.error('[stats-cache] interesting-stat refresh failed', err)
    }

    // If post-steps wrote the first rows, stamp End now.
    if (written > 0 && !getSyncMeta('last_stats_cache')) {
      await setSyncMetaDurable('last_stats_cache', generatedAt)
    }

    await finishStatsCacheRun({
      towns: TMRE_TOWNS,
      consumedThrough: startedAt,
      written,
      durationMs: Date.now() - t0,
      trigger: options.trigger ?? 'all-towns',
      reasons: options.reasons,
    })

    return { written, durationMs: Date.now() - t0 }
  } finally {
    stopHeartbeat()
    if (trackRefresh) endListingsRefresh(new Date().toISOString())
    await releaseStatsCacheRebuildLock(lockToken)
  }
}

/**
 * Upsert stats for specific towns, then refresh by-town bundles + All aggregates.
 * Used after incremental MLS sync when only some towns changed.
 */
export async function rebuildStatsCacheForTowns(
  towns: readonly TmreTown[],
  options: RebuildStatsOptions = {},
): Promise<RebuildStatsResult> {
  const unique = [...new Set(towns)]
  if (unique.length === 0) {
    return { written: 0, durationMs: 0, skipped: true, skipReason: 'empty-towns' }
  }
  if (unique.length >= TMRE_TOWNS.length) {
    return rebuildStatsCache(options)
  }

  const trackRefresh = options.trackRefresh === true
  const lockToken = await acquireStatsCacheRebuildLock(options.force === true)
  if (!lockToken) {
    return { written: 0, durationMs: 0, skipped: true, skipReason: 'lock' }
  }
  const stopHeartbeat = startStatsCacheRebuildHeartbeat()

  if (trackRefresh) beginListingsRefresh('stats-cache')
  const startedAt = new Date().toISOString()
  await setSyncMetaDurable('last_stats_cache_started', startedAt)
  const t0 = Date.now()
  try {
    if (!(await hasLocalListingsCache())) {
      return {
        written: 0,
        durationMs: Date.now() - t0,
        skipped: true,
        skipReason: 'no-listings',
      }
    }

    let written = 0
    const generatedAt = new Date().toISOString()
    const saleBuckets = await getPriceBucketsFresh()
    const inventoryConfig = await getInventorySegmentBandsConfigFresh()
    const inventorySegments: InventorySegmentForCache[] =
      INVENTORY_SEGMENT_IDS.map((id) => {
        const s = inventoryConfig.segments.find((row) => row.id === id)!
        return {
          id: s.id,
          label: s.label,
          min: s.min,
          max: s.max,
          steps: s.steps.filter((b) => !b.hidden),
        }
      })
    for (const town of unique) {
      // Uncapped for the same reason as the full path: All is summed from these.
      const [active, closed, expired] = await Promise.all([
        readStatsListingsFromDb(town, 'Active'),
        readStatsListingsFromDb(town, 'Closed'),
        readStatsListingsFromDb(town, 'Expired'),
      ])
      written += await writeTownMarketStats(
        town,
        active,
        closed,
        generatedAt,
        saleBuckets,
        inventorySegments,
        undefined,
        expired,
      )
      written += await writeMonthsSupplyForTown(town, active, closed, generatedAt)
    }

    written += await refreshByTownBundlesFromTownCaches(generatedAt)
    written += await writeAllAggregateStats(generatedAt, inventorySegments)

    try {
      // The dirty towns were recomputed in the loop above; untouched towns keep
      // their cached rows, and All is summed from all of them.
      const ms = await finalizeMonthsSupplyCache(generatedAt)
      written += ms.written
    } catch (err) {
      console.error('[stats-cache] months-supply rebuild failed (per-town)', err)
    }

    try {
      const closed = await rebuildMarketPulseClosedCache()
      written += closed.written
    } catch (err) {
      console.error(
        '[stats-cache] market-pulse closed rebuild failed (per-town)',
        err,
      )
    }

    if (written > 0) {
      await setSyncMetaDurable('last_stats_cache', generatedAt)
    }
    console.info(
      `[stats-cache] per-town rebuild (${unique.join(', ')}) wrote ${written} entries in ${Date.now() - t0}ms`,
    )

    try {
      const snap = await rebuildIntelligenceTownSnapshots()
      written += snap.written
    } catch (err) {
      console.error('[stats-cache] town snapshot rebuild failed (per-town)', err)
    }

    try {
      const tz = await rebuildTownZipsCache()
      written += tz.written
    } catch (err) {
      console.error('[stats-cache] town-zips rebuild failed (per-town)', err)
    }

    try {
      const { rebuildLatestTownUpdateStatsCache } = await import(
        '@/lib/latest-town-stats-cache'
      )
      const latestStats = await rebuildLatestTownUpdateStatsCache()
      written += latestStats.written
    } catch (err) {
      console.error(
        '[stats-cache] latest town/zip stats rebuild failed (per-town)',
        err,
      )
    }

    try {
      const { rebuildClosedDailyCache } = await import('@/lib/closed-daily-cache')
      const closedDaily = await rebuildClosedDailyCache()
      written += closedDaily.written
    } catch (err) {
      console.error('[stats-cache] closed daily buckets rebuild failed (per-town)', err)
    }

    try {
      if (await refreshInterestingStat(generatedAt)) written += 1
    } catch (err) {
      console.error('[stats-cache] interesting-stat refresh failed (per-town)', err)
    }

    if (written > 0 && !getSyncMeta('last_stats_cache')) {
      await setSyncMetaDurable('last_stats_cache', generatedAt)
    }

    await finishStatsCacheRun({
      towns: unique,
      consumedThrough: startedAt,
      written,
      durationMs: Date.now() - t0,
      trigger: options.trigger ?? 'per-town',
      reasons: options.reasons,
    })

    return { written, durationMs: Date.now() - t0 }
  } finally {
    stopHeartbeat()
    if (trackRefresh) endListingsRefresh(new Date().toISOString())
    await releaseStatsCacheRebuildLock(lockToken)
  }
}

/** Convenience: rebuild a single town's market stats (+ bundles / All). */
export async function rebuildStatsCacheForTown(
  town: TmreTown,
  options: { trackRefresh?: boolean } = {},
): Promise<RebuildStatsResult> {
  return rebuildStatsCacheForTowns([town], options)
}

/**
 * Rebuild whatever is out of date: towns the sync marked dirty, towns past the
 * 24h backstop, and the whole cache when required payloads are missing.
 *
 * `force: true` still rebuilds everything — that is the Admin button and the
 * cache-miss self-heal in the Stats API routes. What is gone is the clock: a
 * cache where no number moved is no longer "stale" just because an hour passed.
 */
export async function rebuildStatsCacheIfStale(
  force = false,
  options: Omit<RebuildStatsOptions, 'force'> = {},
): Promise<RebuildStatsResult> {
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0, skipped: true, skipReason: 'no-listings' }
  }
  if (force) {
    return rebuildStatsCache({ ...options, force: true, trigger: options.trigger ?? 'forced' })
  }

  // Missing required keys is a broken cache, not a dirty town: rebuild all.
  if (await statsCacheMissingRequiredEntries()) {
    return rebuildStatsCache({ ...options, trigger: options.trigger ?? 'missing-entries' })
  }
  const { statsCacheEntries } = await readListingsDbStats()
  if (statsCacheEntries === 0) {
    return rebuildStatsCache({ ...options, trigger: options.trigger ?? 'empty-cache' })
  }

  const { statsTownsDueForRebuild } = await import('@/lib/stats-dirty-towns')
  const { towns, reasons } = await statsTownsDueForRebuild()
  if (towns.length === 0) {
    return { written: 0, durationMs: 0, skipped: true, skipReason: 'not-stale' }
  }
  return rebuildStatsCacheForTowns(towns, {
    ...options,
    reasons,
    trigger: options.trigger ?? 'dirty-towns',
  })
}

/** Queue a stats cache rebuild without blocking the current request. */
export function scheduleStatsCacheRebuildIfStale(force = false): void {
  if (backgroundRebuildScheduled) return
  backgroundRebuildScheduled = true
  void (async () => {
    try {
      if (!(await hasLocalListingsCache())) return
      await rebuildStatsCacheIfStale(force)
    } catch (err) {
      console.error('[stats-cache] background rebuild failed', err)
    } finally {
      backgroundRebuildScheduled = false
    }
  })()
}
