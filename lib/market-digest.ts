import 'server-only'

import { absoluteUrl, SITE_URL } from '@/lib/business-info'
import {
  readListingsFromDb,
  readRecentClosedListingsFromDb,
} from '@/lib/db/listings-repo'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'
import {
  readDealOfTheDayBundle,
  type DealOfTheDayResponse,
} from '@/lib/deal-of-the-day-cache'
import { readDealOfTheWeekCache } from '@/lib/deal-of-the-week-cache'
import { computeTopDeal, type DealPickPayload } from '@/lib/deal-pick'
import { readStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { fmtMoney } from '@/lib/listing-history'
import {
  filterListingsByKind,
  isRentalListing,
  type ListingKind,
} from '@/lib/listing-kind'
import {
  isCommercialPropertyType,
  propertyClassHaystack,
  type ListingPropertyClass,
} from '@/lib/listing-property-class'
import { listingShareHref } from '@/lib/listing-url'
import {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  formatMarketDigestEtDateForWeekday,
  renderMarketDigestSubject,
} from '@/lib/market-digest-config'
import type { SyncScheduleWeekdayEt } from '@/lib/sync-schedule-config-shared'
import { formatMarketDigestHtml } from '@/lib/market-digest-html'
import {
  avgMonthlyClosingsFromClosed,
  computeMonthsSupplyRatio,
  monthsSupplyValueCalcs,
  readMonthsSupplyCached,
  type MonthsSupplyPayload,
} from '@/lib/months-supply-cache'
import type { Listing } from '@/lib/rets'
import type {
  MarketDigestCategorySlice,
  MarketDigestClosedTownCount,
  MarketDigestDealOfTheWeek,
  MarketDigestDomTownCount,
  MarketDigestSnapshot,
} from '@/lib/market-digest-types'
import { MARKET_DIGEST_CLOSED_TRAILING_MONTHS } from '@/lib/market-digest-types'
import type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
import { getSocialProfilesFresh } from '@/lib/social-profiles-config'
import {
  statsCacheKey,
  type MarketStatsPayload,
} from '@/lib/stats-compute'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type {
  MarketDigestCategorySlice,
  MarketDigestClosedTownCount,
  MarketDigestDealOfTheWeek,
  MarketDigestDomTownCount,
  MarketDigestSnapshot,
} from '@/lib/market-digest-types'
export { MARKET_DIGEST_CLOSED_TRAILING_MONTHS } from '@/lib/market-digest-types'
export type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
export { MARKET_PULSE_CATEGORY_IDS } from '@/lib/market-pulse-shared'

type CachedCategorySpec = {
  id: Exclude<MarketPulseCategoryId, 'commercial'>
  label: string
  scopeLabel: string
  selectionLabel: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
}

const CACHED_CATEGORY_SPECS: readonly CachedCategorySpec[] = [
  {
    id: 'all',
    label: 'ALL',
    scopeLabel: 'sales',
    selectionLabel: 'all sales',
    kind: 'sale',
    propertyClass: 'all',
  },
  {
    id: 'sfr',
    label: 'SFR',
    scopeLabel: 'SFR sales',
    selectionLabel: 'SFR',
    kind: 'sale',
    propertyClass: 'homes',
  },
  {
    id: 'condo',
    label: 'Condo',
    scopeLabel: 'condo sales',
    selectionLabel: 'condos',
    kind: 'sale',
    propertyClass: 'condos',
  },
  {
    id: 'rentals',
    label: 'Rentals',
    scopeLabel: 'rentals',
    selectionLabel: 'rentals',
    kind: 'rental',
    propertyClass: 'all',
  },
]

/**
 * Closed totals per town for the trailing window.
 *
 * Only the Monday email asks for these inline: the aggregate scans two years of
 * Closed rows (2–6s per property class) and Market Pulse has 500'd on Netlify
 * before by doing Closed work during a page render. The web page fetches the
 * same numbers per tab from /api/market-pulse/closed-by-town instead.
 */
async function closedTrailingCounts(options: {
  kind: ListingKind
  propertyClass?: ListingPropertyClass
  commercialOnly?: boolean
}): Promise<MarketDigestClosedTownCount[]> {
  try {
    // Email only: allowed to recount if the stats cache has not run yet.
    const { payload } = await readMarketPulseClosedCounts(options, {
      allowCompute: true,
    })
    return payload.rows
  } catch (err) {
    console.warn(
      '[market-digest] closed trailing counts failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

function parseMarketStatsPayload(
  row: { payload: string } | null,
): MarketStatsPayload | null {
  if (!row?.payload) return null
  try {
    return JSON.parse(row.payload) as MarketStatsPayload
  } catch {
    return null
  }
}

/** Avg DOM from stats_cache market-stats (All + each TMRE town). */
async function avgDomByTownFromStats(
  kind: ListingKind,
): Promise<MarketDigestDomTownCount[]> {
  try {
    const cities = ['All', ...TMRE_TOWNS] as const
    const rows = await Promise.all(
      cities.map(async (city) => {
        const cached = await readStatsCacheRow(
          statsCacheKey('market-stats', city, kind),
        )
        const market = parseMarketStatsPayload(cached)
        const avg = market?.avgDaysOnMarket
        if (avg == null || !Number.isFinite(avg) || avg < 0) return null
        return {
          city,
          avgDaysOnMarket: avg,
          avgDaysOnMarketCalc: market?.avgDaysOnMarketCalc,
        }
      }),
    )
    const out: MarketDigestDomTownCount[] = []
    for (const r of rows) {
      if (r) {
        out.push({
          city: r.city,
          avgDaysOnMarket: r.avgDaysOnMarket,
          avgDaysOnMarketCalc: r.avgDaysOnMarketCalc,
        })
      }
    }
    return out
  } catch (err) {
    console.warn(
      '[market-digest] avg DOM by town failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

function isCommercialListing(listing: Listing): boolean {
  return isCommercialPropertyType(propertyClassHaystack(listing))
}

function dealFromPickPayload(
  deal: DealPickPayload & { photoUrl?: string | null },
): MarketDigestDealOfTheWeek | null {
  const listing = deal.listing
  if (!listing?.mlsId) return null
  return {
    mlsId: listing.mlsId,
    address:
      listing.address?.street?.trim() ||
      listing.address?.full?.trim() ||
      listing.mlsId,
    city: listing.address?.city?.trim() || null,
    price: listing.price ?? null,
    insight: deal.insight?.trim() || '',
    href: absoluteUrl(listingShareHref(listing.mlsId)),
    photoUrl: deal.photoUrl
      ? deal.photoUrl.startsWith('http')
        ? deal.photoUrl
        : absoluteUrl(deal.photoUrl)
      : null,
    composite:
      deal.score?.composite != null && Number.isFinite(deal.score.composite)
        ? deal.score.composite
        : null,
    superlatives: Array.isArray(deal.superlatives)
      ? deal.superlatives.filter(
          (w): w is string => typeof w === 'string' && w.trim().length > 0,
        )
      : [],
    beds: listing.beds ?? null,
    baths: listing.baths ?? null,
    sqft: listing.sqft ?? null,
    yearBuilt: listing.yearBuilt ?? null,
    propertyType: listing.propertyType?.trim() || null,
    style: listing.style?.trim() || null,
    valueDiscountPct:
      deal.valueDiscountPct != null && Number.isFinite(deal.valueDiscountPct)
        ? deal.valueDiscountPct
        : null,
    lotAcres:
      deal.lotAcres != null && Number.isFinite(deal.lotAcres)
        ? deal.lotAcres
        : null,
  }
}

function dealFromDotd(deal: DealOfTheDayResponse | null): MarketDigestDealOfTheWeek | null {
  if (!deal) return null
  return dealFromPickPayload(deal)
}

/** Highest-score Deal of the Day across TMRE towns for a kind × property class. */
async function bestDealOfTheDay(
  kind: 'sale' | 'rental',
  propertyClass: ListingPropertyClass,
): Promise<MarketDigestDealOfTheWeek | null> {
  const bundle = await readDealOfTheDayBundle(kind, propertyClass)
  if (!bundle) return null
  let best: DealOfTheDayResponse | null = null
  for (const town of TMRE_TOWNS) {
    const row = bundle.deals[town]
    if (!row) continue
    if (!best || row.score.composite > best.score.composite) best = row
  }
  return dealFromDotd(best)
}

function commercialPayload(
  active: readonly Listing[],
  closed: readonly Listing[],
  city: string,
  generatedAt: string,
): MonthsSupplyPayload {
  const saleActive = filterListingsByKind(active, 'sale').filter(isCommercialListing)
  const saleClosed = filterListingsByKind(closed, 'sale').filter(isCommercialListing)
  const activeCount = saleActive.length
  const avgMonthlyClosings = avgMonthlyClosingsFromClosed(saleClosed)
  const monthsSupply = computeMonthsSupplyRatio(activeCount, avgMonthlyClosings)
  const calcs = monthsSupplyValueCalcs({
    city,
    kind: 'sale',
    propertyClass: 'all',
    activeCount,
    avgMonthlyClosings,
    monthsSupply,
  })
  return {
    city,
    kind: 'sale',
    propertyClass: 'all',
    activeCount,
    activeCountCalc: {
      ...calcs.activeCountCalc,
      summary: `${activeCount.toLocaleString()} active commercial for-sale listings in ${city}.`,
      detail: [
        'Count of Active sale listings classified as commercial at digest build time.',
      ],
    },
    avgMonthlyClosings,
    monthsSupply,
    monthsSupplyCalc: calcs.monthsSupplyCalc
      ? {
          ...calcs.monthsSupplyCalc,
          detail: [
            'Commercial-only: avg monthly closings from commercial Closed sales over the prior 3 full calendar months.',
            'Months supply = active commercial inventory ÷ that average.',
          ],
        }
      : undefined,
    generatedAt,
  }
}

async function buildCachedCategorySlice(
  spec: CachedCategorySpec,
  includeClosedTrailing = false,
): Promise<MarketDigestCategorySlice> {
  const [closedTrailing, avgDomByTown, market, westport, ...townRows] =
    await Promise.all([
      includeClosedTrailing
        ? closedTrailingCounts({
            kind: spec.kind,
            propertyClass: spec.propertyClass,
          })
        : Promise.resolve<MarketDigestClosedTownCount[]>([]),
      avgDomByTownFromStats(spec.kind),
      readMonthsSupplyCached('All', spec.kind, spec.propertyClass),
      readMonthsSupplyCached('Westport', spec.kind, spec.propertyClass),
      ...TMRE_TOWNS.map((town) =>
        readMonthsSupplyCached(town, spec.kind, spec.propertyClass),
      ),
    ])
  const towns = townRows
    .filter((row): row is MonthsSupplyPayload => row != null)
    .sort((a, b) => a.city.localeCompare(b.city))
  return {
    id: spec.id,
    label: spec.label,
    scopeLabel: spec.scopeLabel,
    selectionLabel: spec.selectionLabel,
    market,
    westport,
    towns,
    closedTrailing,
    avgDomByTown,
    deal: null,
  }
}

/** Empty Commercial tab — used when the live pull fails so the page still loads. */
function emptyCommercialCategorySlice(
  generatedAt: string,
): MarketDigestCategorySlice {
  const empty = commercialPayload([], [], 'All', generatedAt)
  return {
    id: 'commercial',
    label: 'Commercial',
    scopeLabel: 'commercial sales',
    selectionLabel: 'commercial',
    market: empty,
    westport: null,
    towns: [],
    closedTrailing: [],
    avgDomByTown: [],
    deal: null,
  }
}

/**
 * Commercial is not in months-supply cache — compute from live Active + recent
 * Closed. Closed is bounded to ~4 months: MOS only needs the trailing 3 full
 * calendar months, and an unbounded Closed pull (all sales since 2019 × 7 towns)
 * is what was 500ing /market-pulse on Netlify.
 */
async function buildCommercialCategorySlice(
  generatedAt: string,
  includeClosedTrailing = false,
): Promise<MarketDigestCategorySlice> {
  try {
    // Four months of lookback covers the three prior full months plus the
    // current partial month, with a little slack for timezone edges.
    const since = new Date()
    since.setUTCMonth(since.getUTCMonth() - 4)
    const sinceIso = since.toISOString()

    const perTown = await Promise.all(
      TMRE_TOWNS.map(async (town) => {
        const [active, closed] = await Promise.all([
          readListingsFromDb(town, 'Active', 500),
          readRecentClosedListingsFromDb(town, sinceIso, 2000),
        ])
        return {
          active,
          closed,
          payload: commercialPayload(active, closed, town, generatedAt),
        }
      }),
    )
    const towns = perTown
      .map((row) => row.payload)
      .sort((a, b) => a.city.localeCompare(b.city))
    const market = commercialPayload(
      perTown.flatMap((row) => row.active),
      perTown.flatMap((row) => row.closed),
      'All',
      generatedAt,
    )
    const westport =
      towns.find((t) => t.city.toLowerCase() === 'westport') ?? null
    const commercialActive = perTown
      .flatMap((row) => row.active)
      .filter(isCommercialListing)
      .filter((l) => !isRentalListing(l))
    const avgDomByTown: MarketDigestDomTownCount[] = []
    const pushCommercialDom = (
      city: string,
      listings: readonly Listing[],
    ) => {
      const doms = listings
        .map((l) => l.dom)
        .filter((d): d is number => d != null && Number.isFinite(d) && d >= 0)
      if (doms.length === 0) return
      const avg = doms.reduce((a, b) => a + b, 0) / doms.length
      avgDomByTown.push({
        city,
        avgDaysOnMarket: avg,
        avgDaysOnMarketCalc: {
          summary: `Mean Days on Market across ${doms.length.toLocaleString()} active commercial listings in ${city} with a non-null DOM.`,
          detail: [
            `Sum of DOM ÷ ${doms.length.toLocaleString()} (active commercial sales only; closed sales excluded).`,
          ],
          inputs: {
            source: 'commercial-active-dom-mean',
            sampleSize: doms.length,
            city,
            avgDaysOnMarket: avg,
          },
        },
      })
    }
    pushCommercialDom('All', commercialActive)
    for (const row of perTown) {
      const townActive = row.active
        .filter(isCommercialListing)
        .filter((l) => !isRentalListing(l))
      pushCommercialDom(row.payload.city, townActive)
    }
    let deal: MarketDigestDealOfTheWeek | null = null
    try {
      const pick = await computeTopDeal(commercialActive)
      deal = pick ? dealFromPickPayload(pick) : null
    } catch (dealErr) {
      console.warn(
        '[market-digest] commercial deal pick failed',
        dealErr instanceof Error ? dealErr.message : dealErr,
      )
    }
    return {
      id: 'commercial',
      label: 'Commercial',
      scopeLabel: 'commercial sales',
      selectionLabel: 'commercial',
      market,
      westport,
      towns,
      closedTrailing: includeClosedTrailing
        ? await closedTrailingCounts({ kind: 'sale', commercialOnly: true })
        : [],
      avgDomByTown,
      deal,
    }
  } catch (err) {
    console.error('[market-digest] commercial slice failed — returning empty', err)
    return emptyCommercialCategorySlice(generatedAt)
  }
}

function fmtMonthsSupply(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `${n.toFixed(1)} mo`
}

function fmtAvgClosings(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value
  return value + ' '.repeat(width - value.length)
}

function townTableLines(rows: MonthsSupplyPayload[]): string[] {
  if (rows.length === 0) return ['(no town rows in cache yet)']
  const header = `${pad('Town', 14)} ${pad('Active', 8)} ${pad('Avg/mo', 8)} MOS`
  const lines = [header, '-'.repeat(header.length)]
  for (const row of rows) {
    const town =
      row.city.trim().toLowerCase() === 'all' ? 'All towns' : row.city.trim()
    lines.push(
      `${pad(town, 14)} ${pad(String(row.activeCount), 8)} ${pad(fmtAvgClosings(row.avgMonthlyClosings), 8)} ${fmtMonthsSupply(row.monthsSupply)}`,
    )
  }
  return lines
}

/**
 * Assemble inventory + months-supply + Deal of the Week for the Monday email
 * and Market Pulse (with category tabs).
 */
export async function buildMarketDigestSnapshot(options?: {
  /**
   * Include the trailing closed-sales totals. Email only — the web page fetches
   * them per tab so a two-year Closed aggregate never blocks the render.
   */
  includeClosedTrailing?: boolean
}): Promise<MarketDigestSnapshot> {
  const includeClosedTrailing = options?.includeClosedTrailing ?? false
  const generatedAt = new Date().toISOString()
  const [cachedSlices, commercial, social, deal] = await Promise.all([
    Promise.all(
      CACHED_CATEGORY_SPECS.map((spec) =>
        buildCachedCategorySlice(spec, includeClosedTrailing),
      ),
    ),
    buildCommercialCategorySlice(generatedAt, includeClosedTrailing),
    getSocialProfilesFresh(),
    readDealOfTheWeekCache(),
  ])

  const categories: MarketDigestCategorySlice[] = [...cachedSlices, commercial]
  const allSlice = categories.find((c) => c.id === 'all')
  const market = allSlice?.market ?? null
  const westport = allSlice?.westport ?? null
  const townRows = allSlice?.towns ?? []

  const dealOfTheWeek = deal ? dealFromPickPayload(deal) : null

  // Per-tab featured deals so Market Pulse doesn't blank the card off ALL/SFR.
  const [sfrDeal, condoDeal, rentalDeal] = await Promise.all([
    bestDealOfTheDay('sale', 'homes'),
    bestDealOfTheDay('sale', 'condos'),
    bestDealOfTheDay('rental', 'all'),
  ])
  const categoriesWithDeals = categories.map((cat) => {
    if (cat.id === 'all') return { ...cat, deal: dealOfTheWeek }
    if (cat.id === 'sfr') return { ...cat, deal: sfrDeal }
    if (cat.id === 'condo') return { ...cat, deal: condoDeal }
    if (cat.id === 'rentals') return { ...cat, deal: rentalDeal }
    // commercial deal already attached in buildCommercialCategorySlice
    return cat
  })

  return {
    generatedAt,
    market,
    westport,
    towns: townRows,
    closedTrailing: allSlice?.closedTrailing ?? [],
    avgDomByTown: allSlice?.avgDomByTown ?? [],
    categories: categoriesWithDeals,
    dealOfTheWeek,
    socialProfiles: social.profiles.map((p) => ({
      label: p.label,
      handleOrUrl: p.handleOrUrl,
    })),
  }
}

export type FormatMarketDigestEmailOptions = {
  subjectTemplate?: string
  includeSocialProfiles?: boolean
  /** Send-day pick list (0=Sun … 6=Sat ET). Drives subject weekday + `{date}`. */
  weekdayEt?: SyncScheduleWeekdayEt
}

export function formatMarketDigestEmail(
  snapshot: MarketDigestSnapshot,
  options?: FormatMarketDigestEmailOptions,
): {
  subject: string
  text: string
  html: string
} {
  const weekdayEt = options?.weekdayEt ?? 1
  // Subject/body date = configured send weekday that week — not “today”, so a
  // Tuesday pick list never yields “Monday, …” (or a Sunday test-send date).
  const etDate = formatMarketDigestEtDateForWeekday(
    new Date(snapshot.generatedAt),
    weekdayEt,
  )

  const subject = renderMarketDigestSubject(
    options?.subjectTemplate ?? DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
    etDate,
    weekdayEt,
  )
  const includeSocial = options?.includeSocialProfiles === true

  const tableRows: MonthsSupplyPayload[] = []
  if (snapshot.market) tableRows.push(snapshot.market)
  for (const town of snapshot.towns) {
    if (
      snapshot.market &&
      town.city.trim().toLowerCase() === snapshot.market.city.trim().toLowerCase()
    ) {
      continue
    }
    tableRows.push(town)
  }

  const kpiLines = [
    'SUMMARY',
    '-------',
    `Market active: ${snapshot.market ? snapshot.market.activeCount : 'n/a'}`,
    `Market MOS:    ${snapshot.market ? fmtMonthsSupply(snapshot.market.monthsSupply) : 'n/a'}`,
    `Westport MOS:  ${snapshot.westport ? fmtMonthsSupply(snapshot.westport.monthsSupply) : 'n/a'}`,
  ]

  const inventoryLines = [
    'ACTIVE INVENTORY & MONTHS SUPPLY (sales)',
    '---------------------------------------',
    ...townTableLines(tableRows),
    '',
    'MOS = active ÷ avg monthly closings (3 prior full months).',
    'Sale listings, all property classes.',
  ]

  const closedRows = snapshot.closedTrailing ?? []
  const closedLines = [
    `CLOSED SALES — TRAILING ${MARKET_DIGEST_CLOSED_TRAILING_MONTHS} MONTHS (sales)`,
    '-------------------------------------------------',
    ...(closedRows.length === 0
      ? ['(no closed sales in the trailing window yet)']
      : closedRows.map(
          (row) => `${pad(row.city.trim() || '—', 14)} ${row.count.toLocaleString()}`,
        )),
  ]

  const dealLines: string[] = ['DEAL OF THE WEEK', '----------------']
  if (snapshot.dealOfTheWeek) {
    const d = snapshot.dealOfTheWeek
    const score =
      d.composite != null && Number.isFinite(d.composite)
        ? d.composite.toFixed(1)
        : '—'
    dealLines.push(
      `Score ${score}`,
      `${d.address}${d.city ? `, ${d.city}` : ''}`,
      `MLS #${d.mlsId}${d.price != null ? ` · ${fmtMoney(d.price)}` : ''}`,
    )
    const meta = [
      d.propertyType,
      d.beds != null && d.baths != null ? `${d.beds}BR/${d.baths}BA` : null,
      d.sqft != null ? `${d.sqft.toLocaleString()} sqft` : null,
      d.yearBuilt != null ? `Built ${d.yearBuilt}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    if (meta) dealLines.push(meta)
    if (d.superlatives.length) {
      dealLines.push(`Superlatives: ${d.superlatives.join(', ')}`)
    }
    if (d.insight) dealLines.push(d.insight)
    dealLines.push(`Listing: ${d.href}`)
    if (d.photoUrl) dealLines.push(`Photo: ${d.photoUrl}`)
  } else {
    dealLines.push('No Deal of the Week in cache yet — check homepage / stats rebuild.')
  }

  const socialLines: string[] = []
  if (includeSocial) {
    socialLines.push(
      'SOCIAL PROFILES (Admin → Communications)',
      '---------------------------------------',
    )
    const filled = snapshot.socialProfiles.filter((p) => p.handleOrUrl)
    if (filled.length === 0) {
      socialLines.push('No handles saved yet.')
    } else {
      for (const p of filled) {
        socialLines.push(`• ${p.label}: ${p.handleOrUrl}`)
      }
    }
    socialLines.push('')
  }

  const text = [
    'TMRE Monday market brief',
    etDate,
    `Web: ${SITE_URL}/market-pulse`,
    `Stats: ${SITE_URL}/stats`,
    '',
    ...kpiLines,
    '',
    ...inventoryLines,
    '',
    ...closedLines,
    '',
    ...dealLines,
    '',
    ...socialLines,
    '— Sent by tmre-website market digest',
  ].join('\n')

  const html = formatMarketDigestHtml(snapshot, etDate, {
    includeSocialProfiles: includeSocial,
  })

  return { subject, text, html }
}
