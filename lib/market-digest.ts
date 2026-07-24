import 'server-only'

import { absoluteUrl, SITE_URL } from '@/lib/business-info'
import { readDealOfTheWeekCache } from '@/lib/deal-of-the-week-cache'
import { fmtMoney } from '@/lib/listing-history'
import { listingShareHref } from '@/lib/listing-url'
import {
  readMonthsSupplyCached,
  type MonthsSupplyPayload,
} from '@/lib/months-supply-cache'
import { getSocialProfilesFresh } from '@/lib/social-profiles-config'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export type MarketDigestSnapshot = {
  generatedAt: string
  market: MonthsSupplyPayload | null
  westport: MonthsSupplyPayload | null
  towns: MonthsSupplyPayload[]
  dealOfTheWeek: {
    mlsId: string
    address: string
    city: string | null
    price: number | null
    insight: string
    href: string
    photoUrl: string | null
  } | null
  socialProfiles: { label: string; handleOrUrl: string }[]
}

function fmtMonthsSupply(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `${n.toFixed(1)} months`
}

function fmtAvgClosings(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function lineForTown(row: MonthsSupplyPayload): string {
  return (
    `${row.city}: ${row.activeCount} active · ` +
    `avg closings/mo ${fmtAvgClosings(row.avgMonthlyClosings)} · ` +
    `months supply ${fmtMonthsSupply(row.monthsSupply)}`
  )
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
} {
  const etDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(snapshot.generatedAt))

  const subject = `Monday market brief — months supply & inventory (${etDate})`

  const calcBlock = [
    'HOW MONTHS SUPPLY IS CALCULATED',
    '--------------------------------',
    'Months supply = active inventory ÷ average monthly closings.',
    '',
    '• Active inventory: current Active sale listings in that town (or All towns).',
    '• Average monthly closings: mean number of Closed sales in each of the prior',
    '  three full calendar months (not including the current month), same town',
    '  and property-class slice.',
    '• Example: 90 active ÷ 30 avg closings/month = 3.0 months of supply.',
    '• Lower months supply usually means a tighter market; higher means more',
    '  inventory relative to recent pace of sales.',
    '',
    'These figures come from the TMRE stats cache (sale listings, all property',
    'classes) refreshed with the site stats rebuild.',
  ]

  const inventoryLines: string[] = [
    'INVENTORY & MONTHS SUPPLY (sales)',
    '--------------------------------',
  ]
  if (snapshot.market) {
    inventoryLines.push(`Market (All towns): ${lineForTown(snapshot.market)}`)
  } else {
    inventoryLines.push('Market (All towns): cache not ready yet')
  }
  if (snapshot.westport) {
    inventoryLines.push(`Westport: ${lineForTown(snapshot.westport)}`)
  }
  inventoryLines.push('')
  inventoryLines.push('By town:')
  if (snapshot.towns.length === 0) {
    inventoryLines.push('  (no town rows in cache yet)')
  } else {
    for (const row of snapshot.towns) {
      inventoryLines.push(`  • ${lineForTown(row)}`)
    }
  }

  const dealLines: string[] = [
    'DEAL OF THE WEEK (social graphic — coming soon)',
    '-----------------------------------------------',
  ]
  if (snapshot.dealOfTheWeek) {
    const d = snapshot.dealOfTheWeek
    dealLines.push(
      `${d.address}${d.city ? `, ${d.city}` : ''}`,
      `MLS #${d.mlsId}${d.price != null ? ` · ${fmtMoney(d.price)}` : ''}`,
    )
    if (d.insight) dealLines.push(d.insight)
    dealLines.push(`Listing: ${d.href}`)
    if (d.photoUrl) dealLines.push(`Hero photo: ${d.photoUrl}`)
    dealLines.push(
      '',
      'A shareable graphic for social will attach here in a later release.',
      'Configured social profiles (Admin → Site) will eventually receive this post.',
    )
  } else {
    dealLines.push('No Deal of the Week in cache yet — check homepage / stats rebuild.')
  }

  const socialLines: string[] = [
    'SOCIAL PROFILES (Admin → Site)',
    '-----------------------------',
  ]
  const filled = snapshot.socialProfiles.filter((p) => p.handleOrUrl)
  if (filled.length === 0) {
    socialLines.push(
      'No handles saved yet. Add Instagram / LinkedIn (or other) profiles on /admin',
      'under Site controls — those slots will drive future auto-posts.',
    )
  } else {
    for (const p of filled) {
      socialLines.push(`• ${p.label}: ${p.handleOrUrl}`)
    }
    socialLines.push('', 'Posting API connection is not wired yet — profiles are stored for later.')
  }

  const text = [
    `TMRE Monday market brief`,
    etDate,
    `Stats: ${SITE_URL}/stats`,
    '',
    ...inventoryLines,
    '',
    ...calcBlock,
    '',
    ...dealLines,
    '',
    ...socialLines,
    '',
    '— Sent by tmre-website market digest',
  ].join('\n')

  return { subject, text }
}
