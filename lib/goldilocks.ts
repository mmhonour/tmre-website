import type { Listing } from './rets'
import type { ScoreBreakdown } from './goldilocks-score-info'
import { isFreshFirstSaleNewConstruction } from './new-construction'

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

/** Pulls condition down from the fresh new-construction default of 100. */
const CONDITION_DOWNGRADE_KEYWORDS = [
  'as-is',
  'as is',
  'needs tlc',
  'needs work',
  'fixer',
  'handyman',
  'estate condition',
  'tear down',
  'teardown',
  'investor special',
  'mold',
]

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

export type { ScoreBreakdown } from './goldilocks-score-info'

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
  return [
    l.remarks,
    l.raw.PublicRemarks,
    l.raw.RemarksPublicAddendum,
    l.raw.RoomsAdditional,
    l.raw.PropertyInfo,
  ]
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

function scoreAge(yearBuilt: number | null): number {
  if (yearBuilt != null && yearBuilt >= 2015) return 92
  if (yearBuilt != null && yearBuilt >= 2000) return 68
  if (yearBuilt != null && yearBuilt >= 1980) return 42
  if (yearBuilt != null) return 28
  return 50
}

function scoreCondition(
  l: Listing,
  remarks: string,
  reno: string[],
  lowQuality: string[],
): number {
  const downgrade = matched(remarks, CONDITION_DOWNGRADE_KEYWORDS)
  const hasNegative = lowQuality.length > 0 || downgrade.length > 0

  if (isFreshFirstSaleNewConstruction(l, remarks) && !hasNegative) {
    return 100
  }

  let s = 50
  s += Math.min(reno.length * 12, 45)
  s -= lowQuality.length * 12
  s -= downgrade.length * 12
  return clamp(s)
}

function scoreFinishes(
  quality: string[],
  photoCount: number | null,
  hasVirtualTour: boolean,
): number {
  let s = 50
  s += Math.min(quality.length * 7, 35)
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
  if (l.status.toLowerCase() !== 'active' && l.status.toLowerCase() !== 'coming soon' && l.status.toLowerCase() !== 'cs') {
    return 'status_not_active'
  }
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
  age: 0.1,
  condition: 0.2,
  finishes: 0.25,
  ppsf: 0.25,
  layout: 0.1,
  schools: 0.1,
}

/** Active listings used to compute city medians / PPSF benchmarks when scoring. */
export const SCORE_PEER_LIMIT = 500

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

  const age = scoreAge(l.yearBuilt)
  const condition = scoreCondition(l, remarks, reno, lowQuality)
  const finishes = scoreFinishes(quality, l.photoCount, hasVirtualTour)
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
    condition * WEIGHTS.condition +
    finishes * WEIGHTS.finishes +
    ppsfFit * WEIGHTS.ppsf +
    layout * WEIGHTS.layout +
    schools * WEIGHTS.schools

  return {
    listing: l,
    kind,
    score: {
      age: Math.round(age * 10) / 10,
      condition: Math.round(condition * 10) / 10,
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

function pct(n: number): string {
  return `${Math.round(Math.abs(n))}%`
}

function describeRemarksCondition(s: ScoredListing, opts?: { rental?: boolean }): string {
  const qualityCount = s.remarksMatched.quality.length
  const renoCount = s.remarksMatched.reno.length
  const total = qualityCount + renoCount
  const subject = opts?.rental ? 'The unit' : 'The property'

  if (total >= 3) return `${subject} has been well cared for.`
  if (renoCount > 0) return `${subject} looks like it's had recent updates.`
  if (qualityCount > 0) {
    return `${subject} comes across as move-in ready in the remarks.`
  }
  if (s.remarksMatched.lowQuality.length > 0) {
    return `${subject} mentions some dated finishes — worth seeing in person.`
  }
  return `${subject} doesn't say much about condition — a showing is the best way to tell.`
}

function describePhotoPresentation(s: ScoredListing): string | null {
  const photos = s.listing.photoCount ?? 0
  const hasReno = s.remarksMatched.reno.length > 0
  const hasQuality = s.remarksMatched.quality.length > 0
  const hasLowQuality = s.remarksMatched.lowQuality.length > 0
  const highlightsUpdates = hasReno || hasQuality

  // Too few frames to read the presentation — point to a showing.
  if (photos <= 2) {
    return 'Only a couple of photos are online, so a tour is the best way to get a feel for the place.'
  }

  // Lackluster / dated cues — frame the upside instead of the flaw.
  if (hasLowQuality) {
    return photos >= 6
      ? 'The photos feel a touch dated, but the bones are all here — this is a space ready to be re-imagined.'
      : 'The photos are a little lackluster, but there is room here to re-imagine the space.'
  }

  // Strong design/renovation cues with a generous gallery — lean into the design story.
  if (highlightsUpdates && photos >= 9) {
    return 'A thoughtfully designed, well-laid-out home comes through clearly across the generous set of photos.'
  }

  if (highlightsUpdates && photos >= 3) {
    return 'The photos carry the updates convincingly from room to room.'
  }

  // Generous gallery, no strong cues either way — average, but point to the opportunity.
  if (photos >= 6) {
    return 'The generous set of photos indicates there are some opportunities here worth a closer look.'
  }

  // Thin gallery, no quality cues.
  if (photos >= 3) {
    return 'The gallery is on the lighter side — a showing will fill in the rest of the story.'
  }

  return null
}

function describeListingPresentation(s: ScoredListing, opts?: { rental?: boolean }): string {
  const qualityCount = s.remarksMatched.quality.length
  const renoCount = s.remarksMatched.reno.length
  const total = qualityCount + renoCount
  const photos = s.listing.photoCount ?? 0
  const subject = opts?.rental ? 'The unit' : 'The property'

  if (total >= 3 && renoCount > 0 && photos >= 3) {
    return `${subject} has been well cared for, and the renovation shows nicely.`
  }

  const remarks = describeRemarksCondition(s, opts)
  const photoNote = describePhotoPresentation(s)
  return photoNote ? `${remarks} ${photoNote}` : remarks
}

// New construction is condition-neutral — "well cared for" is meaningless on a
// brand-new home — so lead with finishes/layout as read from the photos.
function describeNewBuildPresentation(s: ScoredListing): string {
  const photos = s.listing.photoCount ?? 0
  const hasQuality = s.remarksMatched.quality.length > 0
  if (photos >= 9) {
    return hasQuality
      ? 'The finish level and floor plan come through clearly across a full set of photos.'
      : 'The layout and finishes read clearly across a full set of photos.'
  }
  if (photos >= 3) {
    return 'The photos give a good read on the finishes and floor plan.'
  }
  if (photos >= 1) {
    return 'Only a few photos are online so far — a walk-through is the best way to judge the finishes.'
  }
  return 'No photos are online yet — a walk-through is the best way to judge the finishes.'
}

function buildSaleInsight(s: ScoredListing): string {
  const l = s.listing
  const city = l.address.city || 'Fairfield County'
  const isNewConstruction = l.yearBuilt != null && l.yearBuilt >= 2015

  const sentences: string[] = []

  // Value read: price-per-sqft against the local median — the site's core,
  // defensible signal. Richer signals the user asked for — PPSF relative to a
  // specific peer segment (e.g. new construction), and how quickly similarly
  // priced homes have been selling — belong in the refresh-cycle cache, not in
  // a per-request page load, so they are intentionally not computed here.
  if (s.pricePerSqft && s.cityMedianPpsf) {
    const diff = (s.pricePerSqft - s.cityMedianPpsf) / s.cityMedianPpsf
    if (diff < -0.05) {
      sentences.push(
        `On price-per-sqft it comes in ${pct(diff * 100)} below the ${city} median — value for its price band.`,
      )
    } else if (diff > 0.05) {
      sentences.push(
        `It carries a ${pct(diff * 100)} premium to the ${city} median price-per-sqft, in line with a higher-finish tier.`,
      )
    } else {
      sentences.push(`Its price-per-sqft sits right at the ${city} median.`)
    }
  }

  sentences.push(
    isNewConstruction ? describeNewBuildPresentation(s) : describeListingPresentation(s),
  )

  return sentences.filter(Boolean).join(' ')
}

function buildRentalInsight(s: ScoredListing): string {
  const l = s.listing
  const city = l.address.city || 'Fairfield County'
  const isNewConstruction = l.yearBuilt != null && l.yearBuilt >= 2015

  const sentences: string[] = []

  if (s.pricePerSqft && s.cityMedianPpsf) {
    const diff = (s.pricePerSqft - s.cityMedianPpsf) / s.cityMedianPpsf
    if (diff < -0.05) {
      sentences.push(`On rent-per-sqft it asks ${pct(diff * 100)} below the ${city} median.`)
    } else if (diff > 0.05) {
      sentences.push(`It asks ${pct(diff * 100)} above the ${city} median rent-per-sqft.`)
    } else {
      sentences.push(`Rent-per-sqft is right at the ${city} median.`)
    }
  }

  sentences.push(
    isNewConstruction
      ? describeNewBuildPresentation(s)
      : describeListingPresentation(s, { rental: true }),
  )

  return sentences.filter(Boolean).join(' ')
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
  /** Full active inventory for city medians / PPSF benchmarks (defaults to scored set). */
  peerListings?: Listing[]
}

/** Full scored rows for the Deal Table (0–100 composite, no disqualify filter). */
export function scoreListingsForBoard(
  listings: Listing[],
  opts: RunScoringOptions = {},
): ScoredListing[] {
  const aggregates = aggregateByCity(opts.peerListings ?? listings)
  const scored: ScoredListing[] = []
  for (const l of listings) {
    const override = opts.schoolRatings?.get(l.mlsId) ?? null
    scored.push(scoreListing(l, aggregates, override))
  }
  scored.sort((a, b) => b.score.composite - a.score.composite)
  return scored
}

/** Score every listing on the 0–100 Goldilocks composite (no disqualify filter). */
export function scoreBoardListings(
  listings: Listing[],
  opts: RunScoringOptions = {},
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const s of scoreListingsForBoard(listings, opts)) {
    const id = s.listing.mlsId || s.listing.listingKey
    if (id) scores.set(id, s.score.composite)
  }
  return scores
}

export function runScoring(
  listings: Listing[],
  opts: RunScoringOptions = {},
): ScoringRunResult {
  const aggregates = aggregateByCity(opts.peerListings ?? listings)
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
