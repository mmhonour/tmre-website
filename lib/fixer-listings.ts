import type { Listing } from './rets'
import { isMarketListing } from './listings-store'
import { parseLotAcresFromRaw } from './listing-lot-acres'

export const FIXER_KEYWORDS = [
  'fixer',
  'handyman',
  'handyman special',
  'needs work',
  'needs tlc',
  'needs updating',
  'as-is',
  'as is',
  'estate condition',
  'investor special',
  'bring your contractor',
  'contractor special',
  'not habitable',
  'uninhabitable',
  'gut rehab',
  'major renovation',
  'rehab opportunity',
  'value add',
  'dated',
  'original condition',
  'deferred maintenance',
] as const

export const TEARDOWN_KEYWORDS = [
  'tear down',
  'teardown',
  'demolish',
  'demolition',
  'knock down',
  'build new',
  'build your dream',
  'land value',
  'house needs to be removed',
  'house to be removed',
] as const

export const LAND_TYPE_RE = /lots|land|building lot|vacant land/i

export type FixerCategory = 'fixer' | 'teardown' | 'land' | 'build-site'

export type FixerListingView = {
  listing: Listing
  lotAcres: number | null
  pricePerSqft: number | null
  matchedKeywords: string[]
  category: FixerCategory
  fixerScore: number
  headline: string
}

function collectRemarks(l: Listing): string {
  return [
    l.raw.PublicRemarks,
    l.raw.RemarksPublicAddendum,
    l.raw.RoomsAdditional,
    l.raw.PropertyInfo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matched(haystack: string, needles: readonly string[]): string[] {
  return needles.filter((n) => haystack.includes(n))
}

function isSale(l: Listing): boolean {
  return !/rental|for lease/i.test(l.propertyType || '')
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * p)]
}

function cityMedians(listings: Listing[]): Map<string, number> {
  const groups = new Map<string, number[]>()
  for (const l of listings) {
    if (!isSale(l) || !l.price || l.price <= 0) continue
    const city = (l.address.city || 'unknown').toLowerCase()
    if (!groups.has(city)) groups.set(city, [])
    groups.get(city)!.push(l.price)
  }
  const out = new Map<string, number>()
  for (const [city, prices] of groups) {
    const m = median(prices)
    if (m != null) out.set(city, m)
  }
  return out
}

function cityPriceBottom30(listings: Listing[]): Map<string, number> {
  const groups = new Map<string, number[]>()
  for (const l of listings) {
    if (!isSale(l) || !l.price || l.price <= 0) continue
    const city = (l.address.city || 'unknown').toLowerCase()
    if (!groups.has(city)) groups.set(city, [])
    groups.get(city)!.push(l.price)
  }
  const out = new Map<string, number>()
  for (const [city, prices] of groups) {
    const p = percentile(prices, 0.3)
    if (p != null) out.set(city, p)
  }
  return out
}

function classifyCategory(
  fixerHits: string[],
  teardownHits: string[],
  isLandType: boolean,
  lotAcres: number | null,
): FixerCategory {
  if (teardownHits.length > 0) return 'teardown'
  if (isLandType || (lotAcres != null && lotAcres >= 0.5 && fixerHits.length === 0)) {
    return lotAcres != null && lotAcres >= 0.25 ? 'build-site' : 'land'
  }
  return 'fixer'
}

function buildHeadline(
  category: FixerCategory,
  matchedKeywords: string[],
  lotAcres: number | null,
  yearBuilt: number | null,
): string {
  if (category === 'teardown') return 'Teardown or demolition candidate — build from scratch'
  if (category === 'land' || category === 'build-site') {
    return lotAcres != null
      ? `${lotAcres.toFixed(2)} acres — room to build`
      : 'Vacant or buildable lot'
  }
  if (matchedKeywords.some((k) => /handyman|fixer|needs work|tlc/i.test(k))) {
    return 'Handyman special — priced for the work ahead'
  }
  if (yearBuilt != null && yearBuilt <= 1960) return 'Older bones on a value price point'
  return 'Below-market opportunity with upside'
}

export function parseLotAcres(l: Listing): number | null {
  return parseLotAcresFromRaw(l.raw) ?? (l.lotAcres != null && l.lotAcres > 0 ? l.lotAcres : null)
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function scoreFixer(
  l: Listing,
  fixerHits: string[],
  teardownHits: string[],
  lotAcres: number | null,
  cityMedian: number | null,
  cityBottom30: number | null,
): number {
  let score = 0
  score += fixerHits.length * 12
  score += teardownHits.length * 15
  if (LAND_TYPE_RE.test(l.propertyType || '')) score += 20
  if (lotAcres != null) {
    if (lotAcres >= 1) score += 25
    else if (lotAcres >= 0.5) score += 18
    else if (lotAcres >= 0.25) score += 10
  }
  if (l.price && cityMedian && l.price < cityMedian) {
    score += Math.min(20, ((cityMedian - l.price) / cityMedian) * 40)
  }
  if (l.price && cityBottom30 && l.price <= cityBottom30) score += 8
  if (l.yearBuilt != null && l.yearBuilt <= 1960) score += 6
  if (l.yearBuilt != null && l.yearBuilt <= 1940) score += 4
  if (/dated|original|carpet throughout/i.test(collectRemarks(l))) score += 5
  if (l.dom != null && l.dom > 45) score += 4
  return Math.round(score * 10) / 10
}

export function isFixerCandidate(
  l: Listing,
  cityMedian: number | null,
  cityBottom30: number | null,
): boolean {
  if (!isSale(l)) return false
  if (!l.price || l.price <= 0) return false
  if (!isMarketListing(l)) return false

  const remarks = collectRemarks(l)
  const fixerHits = matched(remarks, FIXER_KEYWORDS)
  const teardownHits = matched(remarks, TEARDOWN_KEYWORDS)
  const isLandType = LAND_TYPE_RE.test(l.propertyType || '')
  const lotAcres = parseLotAcres(l)

  if (fixerHits.length > 0 || teardownHits.length > 0 || isLandType) return true
  if (lotAcres != null && lotAcres >= 0.25) {
    const old = l.yearBuilt == null || l.yearBuilt <= 1975
    if (old) return true
  }
  if (
    l.yearBuilt != null &&
    l.yearBuilt <= 1965 &&
    cityBottom30 != null &&
    l.price <= cityBottom30
  ) {
    return true
  }
  if (
    cityMedian != null &&
    l.price < cityMedian * 0.55 &&
    (l.yearBuilt == null || l.yearBuilt <= 1980)
  ) {
    return true
  }
  return false
}

export function buildFixerListings(listings: Listing[]): FixerListingView[] {
  const medians = cityMedians(listings)
  const bottom30 = cityPriceBottom30(listings)
  const out: FixerListingView[] = []

  for (const l of listings) {
    const cityKey = (l.address.city || 'unknown').toLowerCase()
    const cityMedian = medians.get(cityKey) ?? null
    const cityBottom30 = bottom30.get(cityKey) ?? null
    if (!isFixerCandidate(l, cityMedian, cityBottom30)) continue

    const remarks = collectRemarks(l)
    const fixerHits = matched(remarks, FIXER_KEYWORDS)
    const teardownHits = matched(remarks, TEARDOWN_KEYWORDS)
    const isLandType = LAND_TYPE_RE.test(l.propertyType || '')
    const lotAcres = parseLotAcres(l)
    const matchedKeywords = [...new Set([...fixerHits, ...teardownHits])]
    const category = classifyCategory(fixerHits, teardownHits, isLandType, lotAcres)
    const fixerScore = scoreFixer(
      l,
      fixerHits,
      teardownHits,
      lotAcres,
      cityMedian,
      cityBottom30,
    )
    const headline = buildHeadline(category, matchedKeywords, lotAcres, l.yearBuilt)

    out.push({
      listing: l,
      lotAcres,
      pricePerSqft: l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null,
      matchedKeywords,
      category,
      fixerScore,
      headline,
    })
  }

  return out.sort((a, b) => b.fixerScore - a.fixerScore)
}
