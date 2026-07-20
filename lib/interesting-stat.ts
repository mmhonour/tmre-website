import 'server-only'

import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { monthsSupplyCacheKey, type MonthsSupplyPayload } from '@/lib/months-supply-cache'
import {
  statsCacheKey,
  type ActiveByMonthPayload,
  type AvgScoreByVintagePayload,
  type MarketStatsPayload,
  type SalesByMonthPayload,
  type SalesByPricePayload,
  type SalesByVintagePayload,
} from '@/lib/stats-compute'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

/** Featured slot written on each rebuild (newest insight). Homepage may rotate across history. */
export const INTERESTING_STAT_CACHE_KEY = 'interesting-stat:home:v1'
/** Ring of recent insights — recycle/rotate during the day; browsable on Admin → Stats. */
export const INTERESTING_STAT_HISTORY_KEY = 'interesting-stat:history:v1'

export const INTERESTING_STAT_HISTORY_CAP = 24
/** Homepage rotates among recent insights on this interval. */
export const INTERESTING_STAT_ROTATE_MS = 45 * 60 * 1000

export type InterestingStatPayload = {
  /** Stable id for dedupe / admin lists. */
  id: string
  /** Fixed UI label. */
  eyebrow: 'Interesting stat'
  /** Large callout (number or short phrase). */
  value: string
  /** Context under the value. */
  detail: string
  href: string
  town: TmreTown | null
  kind: InterestingStatKind
  generatedAt: string
}

export type InterestingStatKind =
  | 'closed-this-week'
  | 'closed-zip'
  | 'months-supply'
  | 'tightest-supply'
  | 'median-price'
  | 'avg-dom'
  | 'fastest-dom'
  | 'best-vintage'
  | 'vintage-gap'
  | 'active-count'
  | 'most-active'
  | 'avg-ppsf'
  | 'avg-beds'
  | 'sales-vintage'
  | 'sales-price-band'
  | 'sales-yoy'
  | 'sales-mom'
  | 'inventory-mom'

export type InterestingStatHistoryPayload = {
  updatedAt: string
  /** Newest first. */
  entries: InterestingStatPayload[]
}

type Candidate = Omit<InterestingStatPayload, 'eyebrow' | 'generatedAt' | 'id'> & {
  weight: number
  fingerprint: string
}

function parsePayload<T>(row: { payload: string } | null): T | null {
  if (!row?.payload) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

function formatPriceShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const digits = m >= 10 ? 1 : 2
    return `$${m.toFixed(digits).replace(/\.0$/, '').replace(/(\.\d)0$/, '$1')}M`
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1))
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function pickIndex(seed: string, len: number): number {
  if (len <= 0) return 0
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % len
}

function fingerprintOf(kind: InterestingStatKind, town: TmreTown | null, value: string, detail: string): string {
  return `${kind}|${town ?? 'All'}|${value}|${detail}`
}

function toPayload(
  candidate: Candidate,
  generatedAt: string,
): InterestingStatPayload {
  return {
    id: fingerprintOf(candidate.kind, candidate.town, candidate.value, candidate.detail),
    eyebrow: 'Interesting stat',
    value: candidate.value,
    detail: candidate.detail,
    href: candidate.href,
    town: candidate.town,
    kind: candidate.kind,
    generatedAt,
  }
}

function pushCandidate(list: Candidate[], partial: Omit<Candidate, 'fingerprint'>): void {
  list.push({
    ...partial,
    fingerprint: fingerprintOf(partial.kind, partial.town, partial.value, partial.detail),
  })
}

type TownSlice = {
  town: TmreTown
  market: MarketStatsPayload | null
  sales: SalesByMonthPayload | null
  activeByMonth: ActiveByMonthPayload | null
  avgScore: AvgScoreByVintagePayload | null
  salesVintage: SalesByVintagePayload | null
  salesPrice: SalesByPricePayload | null
  months: MonthsSupplyPayload | null
}

async function loadTownSlice(town: TmreTown): Promise<TownSlice> {
  const [market, sales, activeByMonth, avgScore, salesVintage, salesPrice, months] =
    await Promise.all([
      readStatsCacheRow(statsCacheKey('market-stats', town, 'sale')).then((r) =>
        parsePayload<MarketStatsPayload>(r),
      ),
      readStatsCacheRow(statsCacheKey('sales-by-month', town, 'sale')).then((r) =>
        parsePayload<SalesByMonthPayload>(r),
      ),
      readStatsCacheRow(statsCacheKey('active-by-month', town, 'sale')).then((r) =>
        parsePayload<ActiveByMonthPayload>(r),
      ),
      readStatsCacheRow(statsCacheKey('avg-score-by-vintage', town, 'sale')).then((r) =>
        parsePayload<AvgScoreByVintagePayload>(r),
      ),
      readStatsCacheRow(statsCacheKey('sales-by-vintage', town, 'sale')).then((r) =>
        parsePayload<SalesByVintagePayload>(r),
      ),
      readStatsCacheRow(statsCacheKey('sales-by-price', town, 'sale')).then((r) =>
        parsePayload<SalesByPricePayload>(r),
      ),
      readStatsCacheRow(monthsSupplyCacheKey(town, 'sale', 'homes')).then((r) =>
        parsePayload<MonthsSupplyPayload>(r),
      ),
    ])
  return {
    town,
    market,
    sales,
    activeByMonth,
    avgScore,
    salesVintage,
    salesPrice,
    months,
  }
}

function addTownCandidates(candidates: Candidate[], slice: TownSlice): void {
  const { town, market, sales, activeByMonth, avgScore, salesVintage, salesPrice, months } =
    slice
  const statsHref = `/stats?city=${encodeURIComponent(town)}`
  const intelHref = `/intelligence?city=${encodeURIComponent(town)}`

  if (sales && sales.closedThisWeek > 0) {
    pushCandidate(candidates, {
      kind: 'closed-this-week',
      value: String(sales.closedThisWeek),
      detail: `${town} homes closed this week`,
      href: statsHref,
      town,
      weight: sales.closedThisWeek * 2,
    })

    const zipEntries = Object.entries(sales.closedThisWeekByZip ?? {}).filter(
      ([, n]) => typeof n === 'number' && n > 0,
    )
    if (zipEntries.length > 0) {
      zipEntries.sort((a, b) => b[1] - a[1])
      const [zip, n] = zipEntries[0]!
      if (n >= 2 || zipEntries.length === 1) {
        pushCandidate(candidates, {
          kind: 'closed-zip',
          value: String(n),
          detail: `${town} closings this week in ${zip}`,
          href: statsHref,
          town,
          weight: n * 3,
        })
      }
    }
  }

  if (
    months?.monthsSupply != null &&
    Number.isFinite(months.monthsSupply) &&
    months.monthsSupply > 0 &&
    months.monthsSupply < 18
  ) {
    pushCandidate(candidates, {
      kind: 'months-supply',
      value: `${months.monthsSupply.toFixed(1)} mo`,
      detail: `${town} homes months of supply`,
      href: statsHref,
      town,
      weight: 1 / months.monthsSupply,
    })
  }

  if (market?.medianPrice != null && market.medianPrice > 0) {
    pushCandidate(candidates, {
      kind: 'median-price',
      value: formatPriceShort(market.medianPrice),
      detail: `${town} median sale price (closed + active)`,
      href: intelHref,
      town,
      weight: market.medianPrice / 1_000_000,
    })
  }

  if (
    market?.avgDaysOnMarket != null &&
    Number.isFinite(market.avgDaysOnMarket) &&
    market.avgDaysOnMarket > 0
  ) {
    pushCandidate(candidates, {
      kind: 'avg-dom',
      value: `${Math.round(market.avgDaysOnMarket)}d`,
      detail: `${town} avg days on market`,
      href: intelHref,
      town,
      weight: 100 / market.avgDaysOnMarket,
    })
  }

  if (
    market?.avgPricePerSqft != null &&
    Number.isFinite(market.avgPricePerSqft) &&
    market.avgPricePerSqft > 0
  ) {
    pushCandidate(candidates, {
      kind: 'avg-ppsf',
      value: `$${Math.round(market.avgPricePerSqft)}`,
      detail: `${town} avg ask per sq ft (active)`,
      href: intelHref,
      town,
      weight: market.avgPricePerSqft / 100,
    })
  }

  if (market?.avgBeds != null && Number.isFinite(market.avgBeds) && market.avgBeds > 0) {
    pushCandidate(candidates, {
      kind: 'avg-beds',
      value: market.avgBeds.toFixed(1),
      detail: `${town} avg beds on active sales`,
      href: intelHref,
      town,
      weight: market.avgBeds,
    })
  }

  const best = avgScore?.bestValueBucket
  if (best?.avgScore != null && best.count >= 3) {
    pushCandidate(candidates, {
      kind: 'best-vintage',
      value: best.avgScore.toFixed(1),
      detail: `${town} best Goldilocks vintage · ${best.label}`,
      href: intelHref,
      town,
      weight: best.avgScore,
    })

    const scored = (avgScore?.buckets ?? []).filter(
      (b) => b.avgScore != null && b.count >= 3,
    )
    if (scored.length >= 2) {
      const sorted = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      const top = sorted[0]!
      const bottom = sorted[sorted.length - 1]!
      const gap = (top.avgScore ?? 0) - (bottom.avgScore ?? 0)
      if (gap >= 0.8) {
        pushCandidate(candidates, {
          kind: 'vintage-gap',
          value: gap.toFixed(1),
          detail: `${town} score gap · ${top.label} vs ${bottom.label}`,
          href: intelHref,
          town,
          weight: gap * 2,
        })
      }
    }
  }

  if (market && market.activeCount > 0) {
    pushCandidate(candidates, {
      kind: 'active-count',
      value: String(market.activeCount),
      detail: `${town} homes on market`,
      href: intelHref,
      town,
      weight: market.activeCount,
    })
  }

  const topVintage = salesVintage?.topBucket
  if (topVintage && topVintage.count >= 3 && salesVintage && salesVintage.totalSales >= 8) {
    const pct = Math.round(topVintage.share * 100)
    pushCandidate(candidates, {
      kind: 'sales-vintage',
      value: `${pct}%`,
      detail: `${town} closed sales in ${topVintage.label}`,
      href: statsHref,
      town,
      weight: topVintage.count,
    })
  }

  const topPrice = salesPrice?.topBucket
  if (topPrice && topPrice.count >= 3 && salesPrice && salesPrice.totalSales >= 8) {
    const pct = Math.round(topPrice.share * 100)
    pushCandidate(candidates, {
      kind: 'sales-price-band',
      value: `${pct}%`,
      detail: `${town} closed sales in ${topPrice.label}`,
      href: statsHref,
      town,
      weight: topPrice.count,
    })
  }

  if (sales?.data?.length) {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth() + 1
    // Prefer last full month for YoY / MoM.
    const prevMonth = m === 1 ? 12 : m - 1
    const prevYear = m === 1 ? y - 1 : y
    const thisCount =
      sales.data.find((d) => d.year === prevYear && d.month === prevMonth)?.count ?? 0
    const yoyPrior =
      sales.data.find((d) => d.year === prevYear - 1 && d.month === prevMonth)?.count ?? 0
    if (thisCount >= 3 && yoyPrior >= 3) {
      const delta = thisCount - yoyPrior
      const pct = Math.round((delta / yoyPrior) * 100)
      if (Math.abs(pct) >= 15) {
        pushCandidate(candidates, {
          kind: 'sales-yoy',
          value: `${pct > 0 ? '+' : ''}${pct}%`,
          detail: `${town} closings vs ${monthLabel(prevYear - 1, prevMonth)}`,
          href: statsHref,
          town,
          weight: Math.abs(pct),
        })
      }
    }

    const prior2Month = prevMonth === 1 ? 12 : prevMonth - 1
    const prior2Year = prevMonth === 1 ? prevYear - 1 : prevYear
    const momPrior =
      sales.data.find((d) => d.year === prior2Year && d.month === prior2Month)?.count ?? 0
    if (thisCount >= 3 && momPrior >= 3) {
      const delta = thisCount - momPrior
      const pct = Math.round((delta / momPrior) * 100)
      if (Math.abs(pct) >= 20) {
        pushCandidate(candidates, {
          kind: 'sales-mom',
          value: `${pct > 0 ? '+' : ''}${pct}%`,
          detail: `${town} closings ${monthLabel(prevYear, prevMonth)} vs prior month`,
          href: statsHref,
          town,
          weight: Math.abs(pct),
        })
      }
    }
  }

  if (activeByMonth?.data?.length) {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth() + 1
    const prevMonth = m === 1 ? 12 : m - 1
    const prevYear = m === 1 ? y - 1 : y
    const prior2Month = prevMonth === 1 ? 12 : prevMonth - 1
    const prior2Year = prevMonth === 1 ? prevYear - 1 : prevYear
    const a =
      activeByMonth.data.find((d) => d.year === prevYear && d.month === prevMonth)?.count ?? 0
    const b =
      activeByMonth.data.find((d) => d.year === prior2Year && d.month === prior2Month)
        ?.count ?? 0
    if (a >= 5 && b >= 5) {
      const pct = Math.round(((a - b) / b) * 100)
      if (Math.abs(pct) >= 15) {
        pushCandidate(candidates, {
          kind: 'inventory-mom',
          value: `${pct > 0 ? '+' : ''}${pct}%`,
          detail: `${town} active inventory vs prior month`,
          href: statsHref,
          town,
          weight: Math.abs(pct),
        })
      }
    }
  }
}

function addCrossTownCandidates(candidates: Candidate[], slices: TownSlice[]): void {
  const withDom = slices.filter(
    (s) =>
      s.market?.avgDaysOnMarket != null &&
      Number.isFinite(s.market.avgDaysOnMarket) &&
      s.market.avgDaysOnMarket > 0 &&
      (s.market.activeCount ?? 0) >= 5,
  )
  if (withDom.length >= 2) {
    const fastest = [...withDom].sort(
      (a, b) => (a.market!.avgDaysOnMarket ?? 999) - (b.market!.avgDaysOnMarket ?? 999),
    )[0]!
    pushCandidate(candidates, {
      kind: 'fastest-dom',
      value: `${Math.round(fastest.market!.avgDaysOnMarket!)}d`,
      detail: `Fastest avg DOM among TMRE towns · ${fastest.town}`,
      href: `/intelligence?city=${encodeURIComponent(fastest.town)}`,
      town: fastest.town,
      weight: 200 / fastest.market!.avgDaysOnMarket!,
    })
  }

  const withSupply = slices.filter(
    (s) =>
      s.months?.monthsSupply != null &&
      Number.isFinite(s.months.monthsSupply) &&
      s.months.monthsSupply > 0 &&
      s.months.monthsSupply < 18,
  )
  if (withSupply.length >= 2) {
    const tightest = [...withSupply].sort(
      (a, b) => (a.months!.monthsSupply ?? 99) - (b.months!.monthsSupply ?? 99),
    )[0]!
    pushCandidate(candidates, {
      kind: 'tightest-supply',
      value: `${tightest.months!.monthsSupply!.toFixed(1)} mo`,
      detail: `Tightest homes supply · ${tightest.town}`,
      href: `/stats?city=${encodeURIComponent(tightest.town)}`,
      town: tightest.town,
      weight: 10 / tightest.months!.monthsSupply!,
    })
  }

  const withActive = slices.filter((s) => (s.market?.activeCount ?? 0) > 0)
  if (withActive.length >= 2) {
    const most = [...withActive].sort(
      (a, b) => (b.market!.activeCount ?? 0) - (a.market!.activeCount ?? 0),
    )[0]!
    pushCandidate(candidates, {
      kind: 'most-active',
      value: String(most.market!.activeCount),
      detail: `Most active sale inventory · ${most.town}`,
      href: `/intelligence?city=${encodeURIComponent(most.town)}`,
      town: most.town,
      weight: most.market!.activeCount,
    })
  }
}

/**
 * Build a deep candidate set from town caches, then pick one that is new vs history
 * when possible so each stats_cache rebuild surfaces a fresh insight.
 */
export async function buildInterestingStatFromCaches(
  generatedAt: string,
  historyFingerprints: ReadonlySet<string> = new Set(),
  lastFingerprint: string | null = null,
): Promise<InterestingStatPayload | null> {
  const slices = await Promise.all(TMRE_TOWNS.map((town) => loadTownSlice(town)))
  const candidates: Candidate[] = []
  for (const slice of slices) addTownCandidates(candidates, slice)
  addCrossTownCandidates(candidates, slices)

  if (candidates.length === 0) return null

  const fresh = candidates.filter((c) => !historyFingerprints.has(c.fingerprint))
  const pool =
    fresh.length > 0
      ? fresh
      : candidates.filter((c) => c.fingerprint !== lastFingerprint)
  const shortlist = pool.length > 0 ? pool : candidates

  // Prefer variety of kinds in the shortlist: keep best weight per kind, then rotate.
  const byKind = new Map<InterestingStatKind, Candidate>()
  for (const c of shortlist) {
    const prev = byKind.get(c.kind)
    if (!prev || c.weight > prev.weight) byKind.set(c.kind, c)
  }
  const kindShortlist = [...byKind.values()]
  const chosen = kindShortlist[pickIndex(generatedAt, kindShortlist.length)]!
  return toPayload(chosen, generatedAt)
}

export async function readInterestingStatHistory(): Promise<InterestingStatHistoryPayload | null> {
  const cached = parsePayload<InterestingStatHistoryPayload>(
    await readStatsCacheRow(INTERESTING_STAT_HISTORY_KEY),
  )
  if (cached?.entries && Array.isArray(cached.entries)) return cached
  return null
}

function recentForRotation(
  history: InterestingStatHistoryPayload | null,
  nowMs = Date.now(),
): InterestingStatPayload[] {
  const entries = history?.entries ?? []
  if (entries.length === 0) return []
  const dayAgo = nowMs - 24 * 60 * 60 * 1000
  const todays = entries.filter((e) => {
    const t = Date.parse(e.generatedAt)
    return Number.isFinite(t) && t >= dayAgo
  })
  // Need at least 2 to rotate; otherwise fall back to full ring.
  if (todays.length >= 2) return todays
  return entries
}

function rotateFrom(entries: InterestingStatPayload[], nowMs = Date.now()): InterestingStatPayload | null {
  if (entries.length === 0) return null
  const slot = Math.floor(nowMs / INTERESTING_STAT_ROTATE_MS)
  return entries[slot % entries.length]!
}

export async function refreshInterestingStat(generatedAt: string): Promise<boolean> {
  const history = (await readInterestingStatHistory()) ?? {
    updatedAt: generatedAt,
    entries: [],
  }
  const fingerprints = new Set(history.entries.map((e) => e.id || e.detail))
  const last = history.entries[0] ?? null
  const lastFp = last ? last.id || fingerprintOf(last.kind, last.town, last.value, last.detail) : null

  const payload = await buildInterestingStatFromCaches(generatedAt, fingerprints, lastFp)
  if (!payload) return false

  const nextEntries = [payload, ...history.entries.filter((e) => e.id !== payload.id)].slice(
    0,
    INTERESTING_STAT_HISTORY_CAP,
  )
  const nextHistory: InterestingStatHistoryPayload = {
    updatedAt: generatedAt,
    entries: nextEntries,
  }

  await writeStatsCacheRow(INTERESTING_STAT_HISTORY_KEY, nextHistory)
  await writeStatsCacheRow(INTERESTING_STAT_CACHE_KEY, payload)
  return true
}

/**
 * Homepage: rotate among recent insights so the pulse changes during the day
 * even between stats rebuilds. Falls back to featured row / cold build.
 */
export async function readInterestingStat(): Promise<InterestingStatPayload | null> {
  const history = await readInterestingStatHistory()
  const rotated = rotateFrom(recentForRotation(history))
  if (rotated?.value && rotated?.detail) return rotated

  const cached = parsePayload<InterestingStatPayload>(
    await readStatsCacheRow(INTERESTING_STAT_CACHE_KEY),
  )
  if (cached?.value && cached?.detail) return cached

  return buildInterestingStatFromCaches(new Date().toISOString())
}

export type InterestingStatAdminView = {
  current: InterestingStatPayload | null
  /** What the homepage would show right now (rotation). */
  homepage: InterestingStatPayload | null
  history: InterestingStatPayload[]
  rotateIntervalMs: number
  historyCap: number
  updatedAt: string | null
}

export async function readInterestingStatAdminView(): Promise<InterestingStatAdminView> {
  const history = await readInterestingStatHistory()
  const featured = parsePayload<InterestingStatPayload>(
    await readStatsCacheRow(INTERESTING_STAT_CACHE_KEY),
  )
  const homepage = rotateFrom(recentForRotation(history)) ?? featured
  return {
    current: featured,
    homepage,
    history: history?.entries ?? (featured ? [featured] : []),
    rotateIntervalMs: INTERESTING_STAT_ROTATE_MS,
    historyCap: INTERESTING_STAT_HISTORY_CAP,
    updatedAt: history?.updatedAt ?? featured?.generatedAt ?? null,
  }
}
