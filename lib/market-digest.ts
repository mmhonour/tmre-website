import 'server-only'

import { absoluteUrl, SITE_URL } from '@/lib/business-info'
import { readDealOfTheWeekCache } from '@/lib/deal-of-the-week-cache'
import { fmtMoney } from '@/lib/listing-history'
import { listingShareHref } from '@/lib/listing-url'
import { formatMarketDigestHtml } from '@/lib/market-digest-html'
import {
  readMonthsSupplyCached,
  type MonthsSupplyPayload,
} from '@/lib/months-supply-cache'
import { getSocialProfilesFresh } from '@/lib/social-profiles-config'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type MarketDigestDealOfTheWeek = {
  mlsId: string
  address: string
  city: string | null
  price: number | null
  insight: string
  href: string
  photoUrl: string | null
  composite: number | null
  superlatives: string[]
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  propertyType: string | null
  style: string | null
  valueDiscountPct: number | null
  lotAcres: number | null
}

export type MarketDigestSnapshot = {
  generatedAt: string
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  dealOfTheWeek: MarketDigestDealOfTheWeek | null
  socialProfiles: { label: string; handleOrUrl: string }[]
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
 * Assemble inventory + months-supply + Deal of the Week for the Monday email.
 * Uses stats_cache months-supply rows (sale / all property classes).
 */
export async function buildMarketDigestSnapshot(): Promise<MarketDigestSnapshot> {
  const generatedAt = new Date().toISOString()
  const [market, westport, social] = await Promise.all([
    readMonthsSupplyCached('All', 'sale', 'all'),
    readMonthsSupplyCached('Westport', 'sale', 'all'),
    getSocialProfilesFresh(),
  ])

  const townRows: MonthsSupplyPayload[] = []
  for (const town of TMRE_TOWNS) {
    const row = await readMonthsSupplyCached(town, 'sale', 'all')
    if (row) townRows.push(row)
  }
  townRows.sort((a, b) => a.city.localeCompare(b.city))

  const deal = await readDealOfTheWeekCache()
  let dealOfTheWeek: MarketDigestSnapshot['dealOfTheWeek'] = null
  if (deal?.listing?.mlsId) {
    const listing = deal.listing
    dealOfTheWeek = {
      mlsId: listing.mlsId,
      address:
        listing.address.street?.trim() ||
        listing.address.full?.trim() ||
        listing.mlsId,
      city: listing.address.city?.trim() || null,
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
