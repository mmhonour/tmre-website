import type { Listing } from './rets'

const RENO_KEYWORDS = [
  'renovated',
  'updated',
  'new kitchen',
  'new bathrooms',
  'gut renovation',
  'fully remodeled',
  'brand new',
]

const QUALITY_KEYWORDS = [
  'granite',
  'hardwood',
  'stainless',
  'central air',
  'open floor plan',
  "chef's kitchen",
  'chefs kitchen',
  'quartz',
  'marble',
  'custom',
]

const LOW_QUALITY_KEYWORDS = ['carpet throughout', 'dated', 'original']

const GOOD_LAYOUT_KEYWORDS = [
  'open floor plan',
  'en suite',
  'master suite',
  'family room',
  'finished basement',
  'great room',
]

const BAD_LAYOUT_KEYWORDS = ['galley kitchen', 'small bedrooms', 'steep stairs', 'narrow']

const DISQUALIFYING_KEYWORDS = [
  'cesspool',
  'mold',
  'as-is',
  'as is',
  'handyman',
  'needs tlc',
  'estate condition',
  'tear down',
  'teardown',
  'investor special',
  'needs work',
  'fixer',
]

const MIN_SQFT = 1200
const MIN_RENTAL_SQFT = 600
const MIN_SCHOOL_RATING = 65

export type ListingKind = 'sale' | 'rental'

export function kindOf(l: Listing): ListingKind {
  return /rental|for lease/i.test(l.propertyType || '') ? 'rental' : 'sale'
}

function aggregateKey(city: string, kind: ListingKind): string {
  return `${(city || 'unknown').toLowerCase()}::${kind}`
}

export type ScoreBreakdown = {
  ageCondition: number
  finishesQuality: number
  pricePerSqftFit: number
  layoutQuality: number
  schoolRating: number
  composite: number
  weights: {
    age: number
    finishes: number
    ppsf: number
    layout: number
    schools: number
  }
}

const SCHOOL_RATINGS: Record<string, number> = {
  // Westport — uniformly strong public system
  'long lots elementary': 95,
  'long lots': 95,
  'coleytown elementary': 94,
  coleytown: 94,
  'greens farms elementary': 95,
  'greens farms': 95,
  'saugatuck elementary': 94,
  saugatuck: 94,
  'kings highway elementary': 93,
  'kings highway': 93,
  'coleytown middle': 92,
  'bedford middle': 93,
  'staples high school': 95,
  staples: 95,
  // Norwalk — varies sharply by neighborhood
  'rowayton elementary': 88,
  rowayton: 88,
  'brookside elementary': 78,
  brookside: 78,
  'cranbury elementary': 80,
  cranbury: 80,
  'silvermine elementary': 76,
  silvermine: 76,
  'marvin elementary': 78,
  marvin: 78,
  'tracey elementary': 70,
  tracey: 70,
  'wolfpit elementary': 74,
  wolfpit: 74,
  'naramake elementary': 70,
  naramake: 70,
  'jefferson elementary': 65,
  jefferson: 65,
  'kendall elementary': 65,
  kendall: 65,
  'columbus elementary': 62,
  columbus: 62,
  'roton middle': 72,
  'ponus ridge middle': 70,
  'ponus middle': 70,
  'nathan hale middle': 68,
  'west rocks middle': 70,
  'norwalk high school': 70,
  'norwalk high': 70,
  'brien mcmahon': 68,
  'brien mcmahon high school': 68,
}

const TOWN_BASELINE_SCHOOL: Record<string, number> = {
  westport: 92,
  norwalk: 70,
  darien: 93,
  'new canaan': 94,
  weston: 92,
  wilton: 90,
  fairfield: 85,
  greenwich: 88,
  stamford: 72,
}

const DEFAULT_SCHOOL_BASELINE = 65

function normalizeSchool(name: string | null): string | null {
  if (!name) return null
  return name
    .toLowerCase()
    .replace(/\s+school$/i, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function ratingFromName(name: string | null): number | null {
  const norm = normalizeSchool(name)
  if (!norm) return null
  if (SCHOOL_RATINGS[norm] != null) return SCHOOL_RATINGS[norm]
  for (const [key, value] of Object.entries(SCHOOL_RATINGS)) {
    if (norm.includes(key) || key.includes(norm)) return value
  }
  return null
}

function scoreSchools(l: Listing, override?: number | null): number {
  if (override != null && Number.isFinite(override)) return override
  const ratings: number[] = []
  for (const name of [l.schools.elementary, l.schools.middle, l.schools.high]) {
    const r = ratingFromName(name)
    if (r != null) ratings.push(r)
  }
  if (ratings.length > 0) {
    return ratings.reduce((a, b) => a + b, 0) / ratings.length
  }
  const town = l.address.city.toLowerCase().trim()
  return TOWN_BASELINE_SCHOOL[town] ?? DEFAULT_SCHOOL_BASELINE
}

export type DisqualifyReason =
  | 'status_not_active'
  | 'no_photos'
  | 'under_min_sqft'
  | 'top_price_for_town'
  | 'disqualifying_keyword'
  | 'low_school_rating'
  | 'no_price'

export type ScoredListing = {
  listing: Listing
  kind: ListingKind
  score: ScoreBreakdown
  pricePerSqft: number | null
  cityMedianPpsf: number | null
  cityPriceTop15: number | null
  remarksMatched: {
    reno: string[]
    quality: string[]
    lowQuality: string[]
    goodLayout: string[]
    badLayout: string[]
  }
}

function collectRemarks(l: Listing): string {
  return [l.raw.PublicRemarks, l.raw.RemarksPublicAddendum, l.raw.RoomsAdditional, l.raw.PropertyInfo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matched(haystack: string, needles: string[]): string[] {
  return needles.filter((n) => haystack.includes(n))
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

function scoreAge(yearBuilt: number | null, hasReno: boolean): number {
  if (yearBuilt != null && yearBuilt >= 2015) return hasReno ? 100 : 92
  if (hasReno && (yearBuilt == null || yearBuilt >= 2000)) return 90
  if (yearBuilt != null && yearBuilt >= 2000) return hasReno ? 85 : 68
  if (yearBuilt != null && yearBuilt >= 1980) return hasReno ? 68 : 42
  if (yearBuilt != null) return hasReno ? 48 : 28
  return hasReno ? 70 : 50
}

function scoreFinishes(
  quality: string[],
  lowQuality: string[],
  photoCount: number | null,
  hasVirtualTour: boolean,
): number {
  let s = 50
  s += Math.min(quality.length * 7, 35)
  s -= lowQuality.length * 10
  if (photoCount != null && photoCount > 20) s += 8
  if (photoCount != null && photoCount >= 30) s += 4
  if (hasVirtualTour) s += 5
  return clamp(s)
}

function scorePpsf(
  ppsf: number | null,
  cityMedian: number | null,
  cityTop15: number | null,
  cityBottom15: number | null,
): number {
  if (ppsf == null || cityMedian == null || cityMedian <= 0) return 50
  const ratio = ppsf / cityMedian
  if (cityTop15 != null && ppsf >= cityTop15) return 25
  if (cityBottom15 != null && ppsf <= cityBottom15) return 30
  if (ratio >= 0.8 && ratio <= 0.9) return 100
  if (ratio >= 0.75 && ratio < 0.8) return 92
  if (ratio > 0.9 && ratio <= 1.1) return 80 - Math.abs(ratio - 0.85) * 60
  if (ratio < 0.75) return 60
  return clamp(70 - (ratio - 1.1) * 80)
}

function scoreLayout(
  sqft: number | null,
  beds: number | null,
  baths: number | null,
  goodLayout: string[],
  badLayout: string[],
): number {
  let s = 50
  if (sqft && beds && beds > 0) {
    const perBed = sqft / beds
    if (perBed >= 600) s += 12
    else if (perBed >= 450) s += 6
    else if (perBed < 300) s -= 8
  }
  if (beds != null && beds >= 3 && baths != null && baths >= 2) s += 10
  s += Math.min(goodLayout.length * 6, 20)
  s -= badLayout.length * 8
  return clamp(s)
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const idx = Math.floor((sorted.length - 1) * p)
  return sorted[idx]
}

type CityAggregate = {
  medianPpsf: number | null
  topPpsf15: number | null
  bottomPpsf15: number | null
  topPrice15: number | null
}

function aggregateByCity(listings: Listing[]): Map<string, CityAggregate> {
  const groups = new Map<string, { ppsfs: number[]; prices: number[] }>()
  for (const l of listings) {
    const key = aggregateKey(l.address.city, kindOf(l))
    if (!groups.has(key)) groups.set(key, { ppsfs: [], prices: [] })
    const g = groups.get(key)!
    if (l.price && l.price > 0) g.prices.push(l.price)
    if (l.price && l.sqft && l.sqft > 0) g.ppsfs.push(l.price / l.sqft)
  }
  const out = new Map<string, CityAggregate>()
  for (const [k, g] of groups) {
    out.set(k, {
      medianPpsf: median(g.ppsfs),
      topPpsf15: percentile(g.ppsfs, 0.85),
      bottomPpsf15: percentile(g.ppsfs, 0.15),
      topPrice15: percentile(g.prices, 0.85),
    })
  }
  return out
}

export type DisqualifyOptions = {
  schoolOverride?: number | null
  skipSchoolGate?: boolean
}

export function disqualify(
  l: Listing,
  aggregates: Map<string, CityAggregate>,
  opts: DisqualifyOptions = {},
): DisqualifyReason | null {
  if (l.status.toLowerCase() !== 'active') return 'status_not_active'
  if (l.photoCount == null || l.photoCount === 0) return 'no_photos'
  const kind = kindOf(l)
  const minSqft = kind === 'rental' ? MIN_RENTAL_SQFT : MIN_SQFT
  if (!l.sqft || l.sqft < minSqft) return 'under_min_sqft'
  if (!l.price) return 'no_price'
  const remarks = collectRemarks(l)
  if (DISQUALIFYING_KEYWORDS.some((k) => remarks.includes(k))) return 'disqualifying_keyword'
  const cityAgg = aggregates.get(aggregateKey(l.address.city, kind))
  if (cityAgg?.topPrice15 != null && l.price >= cityAgg.topPrice15) return 'top_price_for_town'
  if (!opts.skipSchoolGate && scoreSchools(l, opts.schoolOverride) < MIN_SCHOOL_RATING) {
    return 'low_school_rating'
  }
  return null
}

const WEIGHTS = {
  age: 0.3,
  finishes: 0.2,
  ppsf: 0.2,
  layout: 0.15,
  schools: 0.15,
}

export function scoreListing(
  l: Listing,
  aggregates: Map<string, CityAggregate>,
  schoolOverride?: number | null,
): ScoredListing {
  const remarks = collectRemarks(l)
  const reno = matched(remarks, RENO_KEYWORDS)
  const quality = matched(remarks, QUALITY_KEYWORDS)
  const lowQuality = matched(remarks, LOW_QUALITY_KEYWORDS)
  const goodLayout = matched(remarks, GOOD_LAYOUT_KEYWORDS)
  const badLayout = matched(remarks, BAD_LAYOUT_KEYWORDS)

  const hasVirtualTour = Boolean(l.raw.VirtualTourYN === '1' || l.raw.VirtualTour)

  const kind = kindOf(l)
  const cityAgg = aggregates.get(aggregateKey(l.address.city, kind))
  const ppsf = l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null

  const age = scoreAge(l.yearBuilt, reno.length > 0)
  const finishes = scoreFinishes(quality, lowQuality, l.photoCount, hasVirtualTour)
  const ppsfFit = scorePpsf(
    ppsf,
    cityAgg?.medianPpsf ?? null,
    cityAgg?.topPpsf15 ?? null,
    cityAgg?.bottomPpsf15 ?? null,
  )
  const layout = scoreLayout(l.sqft, l.beds, l.baths, goodLayout, badLayout)
  const schools = scoreSchools(l, schoolOverride)

  const composite =
    age * WEIGHTS.age +
    finishes * WEIGHTS.finishes +
    ppsfFit * WEIGHTS.ppsf +
    layout * WEIGHTS.layout +
    schools * WEIGHTS.schools

  return {
    listing: l,
    kind,
    score: {
      ageCondition: Math.round(age * 10) / 10,
      finishesQuality: Math.round(finishes * 10) / 10,
      pricePerSqftFit: Math.round(ppsfFit * 10) / 10,
      layoutQuality: Math.round(layout * 10) / 10,
      schoolRating: Math.round(schools * 10) / 10,
      composite: Math.round(composite * 10) / 10,
      weights: WEIGHTS,
    },
    pricePerSqft: ppsf,
    cityMedianPpsf: cityAgg?.medianPpsf ?? null,
    cityPriceTop15: cityAgg?.topPrice15 ?? null,
    remarksMatched: { reno, quality, lowQuality, goodLayout, badLayout },
  }
}

function fmtPrice(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

function pct(n: number): string {
  return `${Math.round(Math.abs(n))}%`
}

function describeEra(l: Listing, hasReno: boolean): string {
  if (l.yearBuilt && l.yearBuilt >= 2015) return `new-construction (${l.yearBuilt})`
  if (hasReno) return 'turn-key, recently updated'
  if (l.yearBuilt) return `${l.yearBuilt}-built`
  return 'move-in ready'
}

function describeConditionSignals(s: ScoredListing): string {
  const n = s.remarksMatched.quality.length + s.remarksMatched.reno.length
  if (n >= 3) return 'strong condition signals across the listing remarks'
  if (n > 0) return 'clean condition signals in the remarks'
  return 'solid bones'
}

function buildSaleInsight(s: ScoredListing): string {
  const l = s.listing
  const city = l.address.city || 'Fairfield County'
  const era = describeEra(l, s.remarksMatched.reno.length > 0)
  const type = (l.propertyType || 'home').replace(/ For Sale$/i, '').toLowerCase()

  let ppsfClause = ''
  if (s.pricePerSqft && s.cityMedianPpsf) {
    const diff = (s.pricePerSqft - s.cityMedianPpsf) / s.cityMedianPpsf
    if (diff < -0.05) {
      ppsfClause = `priced ${pct(diff * 100)} below the ${city} median price-per-sqft`
    } else if (diff > 0.05) {
      ppsfClause = `priced ${pct(diff * 100)} above the ${city} median price-per-sqft`
    } else {
      ppsfClause = `priced right at the ${city} median price-per-sqft`
    }
  }

  const composite = s.score.composite.toFixed(1)
  const photos = l.photoCount ?? 0
  const conditionSignals = describeConditionSignals(s)

  const sentence1 = `This ${era} ${type} at ${l.address.street || 'this address'}${
    l.address.city ? ` in ${l.address.city}` : ''
  } hits the Goldilocks zone: ${ppsfClause || 'in the price band buyers actively shop'}, with ${conditionSignals} and ${photos} photos backing it up.`

  const sentence2 = `Goldilocks composite ${composite}/100 — high enough to draw multiple offers in the first weekend if it's listed strategically.`

  const targetLo =
    s.cityMedianPpsf && l.sqft ? Math.round(s.cityMedianPpsf * 0.85 * l.sqft) : null
  const targetHi =
    s.cityMedianPpsf && l.sqft ? Math.round(s.cityMedianPpsf * 0.95 * l.sqft) : null
  const sellerAdvice =
    targetLo && targetHi
      ? `Sellers with comparable ${city} homes (${l.beds ?? '?'}bd / ~${
          l.sqft ? Math.round(l.sqft / 100) * 100 : '?'
        } sqft) should anchor list price in the ${fmtPrice(targetLo)}–${fmtPrice(
          targetHi,
        )} band — undercutting the median PPSF by 5–15% has been driving competitive bidding in this segment.`
      : `Sellers with comparable homes should price 5–15% below the local median PPSF to trigger competitive bidding in this segment.`

  return `${sentence1} ${sentence2} ${sellerAdvice}`
}

function fmtRent(n: number | null): string {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}/mo`
}

function buildRentalInsight(s: ScoredListing): string {
  const l = s.listing
  const city = l.address.city || 'Fairfield County'
  const era = describeEra(l, s.remarksMatched.reno.length > 0)
  const type = (l.propertyType || 'rental')
    .replace(/ For Lease$/i, '')
    .replace(/\s*Rental\s*$/i, '')
    .trim()
    .toLowerCase() || 'rental'

  let rentClause = ''
  if (s.pricePerSqft && s.cityMedianPpsf) {
    const diff = (s.pricePerSqft - s.cityMedianPpsf) / s.cityMedianPpsf
    if (diff < -0.05) {
      rentClause = `asking ${pct(diff * 100)} below the ${city} median rent-per-sqft`
    } else if (diff > 0.05) {
      rentClause = `asking ${pct(diff * 100)} above the ${city} median rent-per-sqft`
    } else {
      rentClause = `asking right at the ${city} median rent-per-sqft`
    }
  }

  const composite = s.score.composite.toFixed(1)
  const photos = l.photoCount ?? 0
  const conditionSignals = describeConditionSignals(s)

  const sentence1 = `This ${era} ${type} rental at ${l.address.street || 'this address'}${
    l.address.city ? ` in ${l.address.city}` : ''
  } is the standout lease this week: ${
    rentClause || 'in the rent band tenants actively shop'
  }, with ${conditionSignals} and ${photos} photos to back it up.`

  const sentence2 = `Goldilocks composite ${composite}/100 against the local rental pool — at this rating, expect showings within the first week.`

  const targetLo =
    s.cityMedianPpsf && l.sqft ? Math.round(s.cityMedianPpsf * 0.95 * l.sqft) : null
  const targetHi =
    s.cityMedianPpsf && l.sqft ? Math.round(s.cityMedianPpsf * 1.05 * l.sqft) : null
  const landlordAdvice =
    targetLo && targetHi
      ? `Landlords with comparable ${city} units (${l.beds ?? '?'}BR / ~${
          l.sqft ? Math.round(l.sqft / 100) * 100 : '?'
        } sqft) should anchor monthly rent in the ${fmtRent(targetLo)}–${fmtRent(
          targetHi,
        )} band to balance occupancy speed against yield.`
      : `Landlords with comparable units should price within ±5% of the local median rent-per-sqft to balance occupancy speed against yield.`

  return `${sentence1} ${sentence2} ${landlordAdvice}`
}

export function buildInsight(s: ScoredListing): string {
  return s.kind === 'rental' ? buildRentalInsight(s) : buildSaleInsight(s)
}

export type ScoringRunResult = {
  scored: ScoredListing[]
  rejected: { listing: Listing; reason: DisqualifyReason }[]
}

export type RunScoringOptions = {
  schoolRatings?: Map<string, number>
}

export function runScoring(
  listings: Listing[],
  opts: RunScoringOptions = {},
): ScoringRunResult {
  const aggregates = aggregateByCity(listings)
  const scored: ScoredListing[] = []
  const rejected: { listing: Listing; reason: DisqualifyReason }[] = []
  for (const l of listings) {
    const override = opts.schoolRatings?.get(l.mlsId) ?? null
    const reason = disqualify(l, aggregates, { schoolOverride: override })
    if (reason) {
      rejected.push({ listing: l, reason })
      continue
    }
    scored.push(scoreListing(l, aggregates, override))
  }
  scored.sort((a, b) => b.score.composite - a.score.composite)
  return { scored, rejected }
}

/**
 * Returns the listings that pass the cheap (non-school) disqualifiers.
 * Use this to build a shortlist before paying for live school lookups.
 */
export function cheapShortlist(listings: Listing[]): Listing[] {
  const aggregates = aggregateByCity(listings)
  return listings.filter(
    (l) => disqualify(l, aggregates, { skipSchoolGate: true }) === null,
  )
}
