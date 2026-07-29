import 'server-only'

import { absoluteUrl, SITE_URL } from '@/lib/business-info'
import {
  readListingsFromDb,
  readRecentClosedListingsFromDb,
} from '@/lib/db/listings-repo'
import { readDealOfTheWeekCache } from '@/lib/deal-of-the-week-cache'
import { fmtMoney } from '@/lib/listing-history'
import { filterListingsByKind, type ListingKind } from '@/lib/listing-kind'
import {
  isCommercialPropertyType,
  propertyClassHaystack,
  type ListingPropertyClass,
} from '@/lib/listing-property-class'
import { listingShareHref } from '@/lib/listing-url'
import { formatMarketDigestHtml } from '@/lib/market-digest-html'
import {
  avgMonthlyClosingsFromClosed,
  computeMonthsSupplyRatio,
  readMonthsSupplyCached,
  type MonthsSupplyPayload,
} from '@/lib/months-supply-cache'
import type { Listing } from '@/lib/rets'
import type {
  MarketDigestCategorySlice,
  MarketDigestSnapshot,
} from '@/lib/market-digest-types'
import type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
import { getSocialProfilesFresh } from '@/lib/social-profiles-config'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type {
  MarketDigestCategorySlice,
  MarketDigestDealOfTheWeek,
  MarketDigestSnapshot,
} from '@/lib/market-digest-types'
export type { MarketPulseCategoryId } from '@/lib/market-pulse-shared'
export { MARKET_PULSE_CATEGORY_IDS } from '@/lib/market-pulse-shared'

type CachedCategorySpec = {
  id: Exclude<MarketPulseCategoryId, 'commercial'>
  label: string
  scopeLabel: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
}

const CACHED_CATEGORY_SPECS: readonly CachedCategorySpec[] = [
  {
    id: 'all',
    label: 'ALL',
    scopeLabel: 'sales',
    kind: 'sale',
    propertyClass: 'all',
  },
  {
    id: 'sfr',
    label: 'SFR',
    scopeLabel: 'SFR sales',
    kind: 'sale',
    propertyClass: 'homes',
  },
  {
    id: 'condo',
    label: 'Condo',
    scopeLabel: 'condo sales',
    kind: 'sale',
    propertyClass: 'condos',
  },
  {
    id: 'rentals',
    label: 'Rentals',
    scopeLabel: 'rentals',
    kind: 'rental',
    propertyClass: 'all',
  },
]

function isCommercialListing(listing: Listing): boolean {
  return isCommercialPropertyType(propertyClassHaystack(listing))
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
  return {
    city,
    kind: 'sale',
    propertyClass: 'all',
    activeCount,
    avgMonthlyClosings,
    monthsSupply: computeMonthsSupplyRatio(activeCount, avgMonthlyClosings),
    generatedAt,
  }
}

async function buildCachedCategorySlice(
  spec: CachedCategorySpec,
): Promise<MarketDigestCategorySlice> {
  const [market, westport, ...townRows] = await Promise.all([
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
    market,
    westport,
    towns,
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
    market: empty,
    westport: null,
    towns: [],
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
    return {
      id: 'commercial',
      label: 'Commercial',
      scopeLabel: 'commercial sales',
      market,
      westport,
      towns,
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
export async function buildMarketDigestSnapshot(): Promise<MarketDigestSnapshot> {
  const generatedAt = new Date().toISOString()
  const [cachedSlices, commercial, social, deal] = await Promise.all([
    Promise.all(CACHED_CATEGORY_SPECS.map((spec) => buildCachedCategorySlice(spec))),
    buildCommercialCategorySlice(generatedAt),
    getSocialProfilesFresh(),
    readDealOfTheWeekCache(),
  ])

  const categories: MarketDigestCategorySlice[] = [...cachedSlices, commercial]
  const allSlice = categories.find((c) => c.id === 'all')
  const market = allSlice?.market ?? null
  const westport = allSlice?.westport ?? null
  const townRows = allSlice?.towns ?? []

  let dealOfTheWeek: MarketDigestSnapshot['dealOfTheWeek'] = null
  if (deal?.listing?.mlsId) {
    const listing = deal.listing
    dealOfTheWeek = {
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
        ? deal.superlatives.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
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

  return {
    generatedAt,
    market,
    westport,
    towns: townRows,
    categories,
    dealOfTheWeek,
    socialProfiles: social.profiles.map((p) => ({
      label: p.label,
      handleOrUrl: p.handleOrUrl,
    })),
  }
}

export function formatMarketDigestEmail(snapshot: MarketDigestSnapshot): {
  subject: string
  text: string
  html: string
} {
  const etDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(snapshot.generatedAt))

  const subject = `Monday market brief — months supply & inventory (${etDate})`

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

  const socialLines: string[] = [
    'SOCIAL PROFILES (Admin → Site)',
    '-----------------------------',
  ]
  const filled = snapshot.socialProfiles.filter((p) => p.handleOrUrl)
  if (filled.length === 0) {
    socialLines.push('No handles saved yet.')
  } else {
    for (const p of filled) {
      socialLines.push(`• ${p.label}: ${p.handleOrUrl}`)
    }
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
    ...dealLines,
    '',
    ...socialLines,
    '',
    '— Sent by tmre-website market digest',
  ].join('\n')

  const html = formatMarketDigestHtml(snapshot, etDate)

  return { subject, text, html }
}
