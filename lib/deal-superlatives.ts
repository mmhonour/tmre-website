import type { ScoreBreakdown } from './goldilocks-score-info'

export type DealSuperlativeInput = {
  score: {
    age: number
    condition: number
    finishesQuality: number
    pricePerSqftFit: number
    layoutQuality: number
    schoolRating: number
    composite: number
  }
  listing: {
    dom: number | null
    price: number | null
    originalListPrice: number | null
    remarks?: string | null
    mlsId?: string
    raw?: {
      PublicRemarks?: string | null
      RemarksPublicAddendum?: string | null
      RoomsAdditional?: string | null
      PropertyInfo?: string | null
      MarketingRemarks?: string | null
    }
  }
  valueDiscountPct?: number | null
  pickMode?: 'below-median' | 'board-top'
  lotAcres?: number | null
  peerStats?: ListingPeerStats | null
  styleKey?: string | null
  yearBuilt?: number | null
  sqft?: number | null
}

export type ListingPeerStats = {
  peerCount: number
  /** Higher = larger living area vs peers (0–100). */
  sqftPct: number | null
  /** Higher = larger lot vs peers (0–100). */
  lotPct: number | null
  /** Higher = newer build year vs peers (0–100). */
  yearPct: number | null
  /** Lower DOM percentile = fresher vs peers (0–100). */
  domPct: number | null
  /** Lower price percentile = better value vs peers (0–100). */
  pricePct: number | null
  /** Share of peers with the same normalized style (0–100). */
  styleShare: number | null
  conditionPct: number | null
  layoutPct: number | null
  ageScorePct: number | null
  finishesPct: number | null
  compositePct: number | null
}

type Candidate = { word: string; weight: number }

const SCORE_MIN = 78
const TOP_PEER_TIER = 85
const RARE_STYLE_SHARE = 12

const TRADITIONAL_STYLE_KEYS = new Set([
  'colonial',
  'cape',
  'cape-cod',
  'ranch',
  'split',
  'split-level',
  'split-level-ranch',
  'tudor',
  'victorian',
  'saltbox',
  'farmhouse',
  'bungalow',
  'cottage',
  'craftsman',
  'dutch-colonial',
  'garrison-colonial',
  'cape-cod-colonial',
  'raised-ranch',
  'bi-level',
  'bi-level-ranch',
])

const CONTEMPORARY_STYLE_KEYS = new Set([
  'contemporary',
  'modern',
  'mid-century',
  'midcentury',
  'mid-century-modern',
])

const STYLE_SHORT_LABELS: Record<string, string> = {
  colonial: 'Colonial',
  cape: 'Cape',
  'cape-cod': 'Cape',
  ranch: 'Ranch',
  split: 'Split',
  'split-level': 'Split',
  tudor: 'Tudor',
  victorian: 'Victorian',
  farmhouse: 'Farmhouse',
  bungalow: 'Bungalow',
  cottage: 'Cottage',
  craftsman: 'Craftsman',
  contemporary: 'Contemporary',
  modern: 'Modern',
  'mid-century': 'Mid-Century',
  midcentury: 'Mid-Century',
  'mid-century-modern': 'Mid-Century',
}

/** Case-insensitive rehab/renovation language required before a finishes superlative. */
const REHAB_EVIDENCE_KEYWORDS = [
  'rehabbed',
  'rehab',
  'renovated',
  'renovation',
  'remodeled',
  'remodel',
  'gut renovation',
  'fully remodeled',
  'recently rehabbed',
  'newly renovated',
  'newly remodeled',
]

const REHAB_SYNONYMS = ['Refreshed', 'Renovated', 'Modernized', 'Updated', 'Renewed'] as const

function percentileRank(value: number, values: readonly number[]): number {
  if (values.length === 0) return 50
  const below = values.filter((v) => v < value).length
  const equal = values.filter((v) => v === value).length
  return ((below + equal * 0.5) / values.length) * 100
}

function peerNumericValues(
  peers: readonly { value: number | null | undefined }[],
): number[] {
  return peers
    .map((row) => row.value)
    .filter((value): value is number => value != null && Number.isFinite(value))
}

function peerScoreValues(
  peers: readonly { score: number | null | undefined }[],
): number[] {
  return peers
    .map((row) => row.score)
    .filter((value): value is number => value != null && Number.isFinite(value))
}

export function normalizeStyleKey(style: string | null | undefined): string | null {
  const trimmed = style?.trim()
  if (!trimmed) return null
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || null
}

export function isTraditionalStyle(styleKey: string | null | undefined): boolean {
  if (!styleKey) return false
  if (TRADITIONAL_STYLE_KEYS.has(styleKey)) return true
  return (
    styleKey.includes('colonial') ||
    styleKey.includes('cape') ||
    styleKey.includes('ranch') ||
    styleKey.includes('split') ||
    styleKey.includes('tudor') ||
    styleKey.includes('victorian') ||
    styleKey.includes('farmhouse') ||
    styleKey.includes('bungalow') ||
    styleKey.includes('cottage')
  )
}

export function isContemporaryStyle(styleKey: string | null | undefined): boolean {
  if (!styleKey) return false
  if (CONTEMPORARY_STYLE_KEYS.has(styleKey)) return true
  return styleKey.includes('contemporary') || styleKey.includes('modern') || styleKey.includes('mid-century')
}

function styleShortLabel(styleKey: string): string {
  if (STYLE_SHORT_LABELS[styleKey]) return STYLE_SHORT_LABELS[styleKey]
  const segment = styleKey.split('-')[0]
  if (!segment) return 'Home'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export type PeerStatsListing = {
  sqft?: number | null
  lotAcres?: number | null
  yearBuilt?: number | null
  dom?: number | null
  price?: number | null
  styleKey?: string | null
  score?: Pick<
    ScoreBreakdown,
    'condition' | 'layoutQuality' | 'age' | 'finishesQuality' | 'composite'
  > | null
}

/** Compute percentile ranks for a listing against same-bucket peers (self excluded). */
export function computeListingPeerStats(
  listing: PeerStatsListing,
  peers: readonly PeerStatsListing[],
): ListingPeerStats {
  const sqftValues = peerNumericValues(peers.map((p) => ({ value: p.sqft })))
  const lotValues = peerNumericValues(peers.map((p) => ({ value: p.lotAcres })))
  const yearValues = peerNumericValues(peers.map((p) => ({ value: p.yearBuilt })))
  const domValues = peerNumericValues(peers.map((p) => ({ value: p.dom })))
  const priceValues = peerNumericValues(peers.map((p) => ({ value: p.price })))

  const styleKey = listing.styleKey ?? null
  let styleShare: number | null = null
  if (styleKey && peers.length > 0) {
    const sameStyle = peers.filter((p) => p.styleKey === styleKey).length
    styleShare = (sameStyle / peers.length) * 100
  }

  const conditionValues = peerScoreValues(peers.map((p) => ({ score: p.score?.condition })))
  const layoutValues = peerScoreValues(peers.map((p) => ({ score: p.score?.layoutQuality })))
  const ageScoreValues = peerScoreValues(peers.map((p) => ({ score: p.score?.age })))
  const finishesValues = peerScoreValues(peers.map((p) => ({ score: p.score?.finishesQuality })))
  const compositeValues = peerScoreValues(peers.map((p) => ({ score: p.score?.composite })))

  return {
    peerCount: peers.length,
    sqftPct: listing.sqft != null && sqftValues.length > 0 ? percentileRank(listing.sqft, sqftValues) : null,
    lotPct:
      listing.lotAcres != null && lotValues.length > 0
        ? percentileRank(listing.lotAcres, lotValues)
        : null,
    yearPct:
      listing.yearBuilt != null && yearValues.length > 0
        ? percentileRank(listing.yearBuilt, yearValues)
        : null,
    domPct:
      listing.dom != null && domValues.length > 0
        ? percentileRank(listing.dom, domValues)
        : null,
    pricePct:
      listing.price != null && priceValues.length > 0
        ? percentileRank(listing.price, priceValues)
        : null,
    styleShare,
    conditionPct:
      listing.score?.condition != null && conditionValues.length > 0
        ? percentileRank(listing.score.condition, conditionValues)
        : null,
    layoutPct:
      listing.score?.layoutQuality != null && layoutValues.length > 0
        ? percentileRank(listing.score.layoutQuality, layoutValues)
        : null,
    ageScorePct:
      listing.score?.age != null && ageScoreValues.length > 0
        ? percentileRank(listing.score.age, ageScoreValues)
        : null,
    finishesPct:
      listing.score?.finishesQuality != null && finishesValues.length > 0
        ? percentileRank(listing.score.finishesQuality, finishesValues)
        : null,
    compositePct:
      listing.score?.composite != null && compositeValues.length > 0
        ? percentileRank(listing.score.composite, compositeValues)
        : null,
  }
}

function collectListingText(listing: DealSuperlativeInput['listing']): string {
  const parts: string[] = []
  if (listing.remarks) parts.push(listing.remarks)
  const raw = listing.raw
  if (raw) {
    for (const field of [
      raw.PublicRemarks,
      raw.RemarksPublicAddendum,
      raw.RoomsAdditional,
      raw.PropertyInfo,
      raw.MarketingRemarks,
    ]) {
      if (field) parts.push(field)
    }
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function hasRehabEvidence(text: string): boolean {
  return REHAB_EVIDENCE_KEYWORDS.some((keyword) => text.includes(keyword))
}

function stableSynonymIndex(seed: string, modulo: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash % modulo
}

function pickRehabSuperlative(text: string, seed?: string): string {
  if (/\brenovated?\b/.test(text)) return 'Renovated'
  if (/\bremodel(ed|ing)?\b/.test(text)) return 'Modernized'
  if (/\brehab(bed|bing)?\b/.test(text)) return 'Refreshed'
  if (/\brenew(ed|al)?\b/.test(text)) return 'Renewed'
  if (/\bupdated?\b/.test(text)) return 'Updated'

  const index = stableSynonymIndex(seed ?? text, REHAB_SYNONYMS.length)
  return REHAB_SYNONYMS[index]
}

function peerTopTier(pct: number | null | undefined, min = TOP_PEER_TIER): boolean {
  return pct != null && pct >= min
}

/** When peer score percentiles are unavailable, do not block absolute-threshold tags. */
function peerTopTierWhenKnown(pct: number | null | undefined, min = TOP_PEER_TIER): boolean {
  return pct == null || pct >= min
}

function peerBottomTier(pct: number | null | undefined, max = 15): boolean {
  return pct != null && pct <= max
}

function addAgeSuperlative(
  candidates: Candidate[],
  styleKey: string | null,
  peerStats: ListingPeerStats | null | undefined,
  scoreAge: number,
): void {
  const yearPct = peerStats?.yearPct
  const ageScorePct = peerStats?.ageScorePct
  const isNew =
    peerTopTier(yearPct, 85) ||
    peerTopTier(ageScorePct, 85) ||
    (scoreAge >= SCORE_MIN && peerTopTier(ageScorePct, 80))
  const isClassic =
    yearPct != null && yearPct <= 20 && scoreAge >= 70 && !isNew

  if (!styleKey) {
    if (isNew && scoreAge >= SCORE_MIN) {
      candidates.push({ word: 'Modern', weight: 72 + scoreAge * 0.2 })
    }
    return
  }

  const label = styleShortLabel(styleKey)

  if (isContemporaryStyle(styleKey)) {
    if (isNew && scoreAge >= SCORE_MIN) {
      candidates.push({ word: 'Modern', weight: 78 + scoreAge * 0.22 })
    }
    return
  }

  if (isTraditionalStyle(styleKey)) {
    if (isNew && scoreAge >= SCORE_MIN) {
      candidates.push({ word: `New-${label}`, weight: 82 + scoreAge * 0.2 })
    } else if (isClassic) {
      candidates.push({ word: `Classic-${label}`, weight: 74 + scoreAge * 0.15 })
    }
    return
  }

  if (isNew && scoreAge >= SCORE_MIN) {
    candidates.push({ word: `New-${label}`, weight: 76 + scoreAge * 0.18 })
  }
}

function addStyleRaritySuperlative(
  candidates: Candidate[],
  styleKey: string | null,
  peerStats: ListingPeerStats | null | undefined,
  composite: number,
): void {
  if (!styleKey || peerStats?.styleShare == null) return
  if (peerStats.styleShare > RARE_STYLE_SHARE) return

  const label = styleShortLabel(styleKey)
  const lotTop = peerTopTier(peerStats.lotPct, 85)
  const compositeTop = peerTopTier(peerStats.compositePct, 88) || composite >= 88

  if (lotTop) {
    candidates.push({ word: `Estate-${label}`, weight: 88 + (100 - peerStats.styleShare) })
  } else if (compositeTop) {
    candidates.push({ word: `Rare-${label}`, weight: 86 + (100 - peerStats.styleShare) * 0.5 })
  } else {
    candidates.push({ word: label, weight: 70 + (100 - peerStats.styleShare) * 0.4 })
  }
}

function finalizeCandidates(
  candidates: Candidate[],
  score: DealSuperlativeInput['score'],
  pickMode: DealSuperlativeInput['pickMode'],
): string[] {
  const byWord = new Map<string, number>()
  for (const c of candidates) {
    byWord.set(c.word, Math.max(byWord.get(c.word) ?? 0, c.weight))
  }

  const ranked = [...byWord.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  if (ranked.length >= 3) return ranked.slice(0, 5)

  const fallbacks: Candidate[] = [
    { word: 'Curated', weight: score.composite },
    { word: 'Quality', weight: (score.condition + score.finishesQuality) / 2 },
  ]
  if (pickMode === 'board-top') {
    fallbacks.push({ word: 'Top-tier', weight: score.composite - 5 })
  }

  for (const c of fallbacks) {
    if (!byWord.has(c.word)) {
      byWord.set(c.word, c.weight)
    }
  }

  return [...byWord.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)
}

/** Join superlative tags for Intelligence board headlines. */
export function formatSuperlativesHeadline(words: readonly string[]): string {
  return words.filter(Boolean).slice(0, 5).join(' · ')
}

/** 3–5 tags explaining why a listing stands out among zip/town peers. */
export function deriveDealSuperlatives(input: DealSuperlativeInput): string[] {
  const { score, listing, valueDiscountPct, pickMode, lotAcres, peerStats, styleKey, sqft } =
    input
  const candidates: Candidate[] = []
  const listingText = collectListingText(listing)
  const pricePct = peerStats?.pricePct

  if (valueDiscountPct != null && valueDiscountPct >= 10) {
    candidates.push({ word: 'Undervalued', weight: 100 + valueDiscountPct })
  } else if (
    pickMode === 'below-median' ||
    (valueDiscountPct != null && valueDiscountPct >= 3) ||
    peerBottomTier(pricePct, 25)
  ) {
    candidates.push({
      word: 'Value',
      weight: 80 + (valueDiscountPct ?? Math.max(0, 25 - (pricePct ?? 50))),
    })
  }

  if (score.pricePerSqftFit >= 78 && (!peerStats || peerBottomTier(pricePct, 40))) {
    candidates.push({ word: 'Value', weight: 70 + score.pricePerSqftFit * 0.25 })
  }

  const dom = listing.dom
  const freshByPeers = peerStats ? peerBottomTier(peerStats.domPct, 15) : dom != null && dom <= 7
  if (dom != null && dom <= 14 && freshByPeers) {
    candidates.push({ word: 'Fresh', weight: 92 - dom })
  }

  if (
    score.condition >= SCORE_MIN &&
    peerTopTierWhenKnown(peerStats?.conditionPct, 85)
  ) {
    candidates.push({ word: 'Turnkey', weight: score.condition })
  }

  if (
    score.finishesQuality >= SCORE_MIN &&
    hasRehabEvidence(listingText) &&
    peerTopTierWhenKnown(peerStats?.finishesPct, 85)
  ) {
    candidates.push({
      word: pickRehabSuperlative(listingText, listing.mlsId),
      weight: score.finishesQuality,
    })
  }

  if (
    score.layoutQuality >= SCORE_MIN &&
    peerTopTierWhenKnown(peerStats?.layoutPct, 85)
  ) {
    candidates.push({ word: 'Layout', weight: score.layoutQuality })
  }

  addAgeSuperlative(candidates, styleKey ?? null, peerStats, score.age)

  if (
    listing.price &&
    listing.originalListPrice &&
    listing.originalListPrice > listing.price
  ) {
    const pct = Math.round(
      ((listing.originalListPrice - listing.price) / listing.originalListPrice) * 100,
    )
    if (pct >= 3) {
      candidates.push({ word: 'Reduced', weight: 75 + pct })
    }
  }

  if (peerStats ? peerTopTier(peerStats.lotPct, 90) : lotAcres != null && lotAcres >= 0.35) {
    const lotWeight = peerStats?.lotPct != null ? 60 + peerStats.lotPct * 0.35 : 60 + (lotAcres ?? 0) * 20
    candidates.push({ word: 'Spacious', weight: lotWeight })
  }

  if (
    sqft != null &&
    peerStats?.sqftPct != null &&
    peerTopTier(peerStats.sqftPct, 90)
  ) {
    candidates.push({ word: 'Roomy', weight: 68 + peerStats.sqftPct * 0.25 })
  }

  addStyleRaritySuperlative(candidates, styleKey ?? null, peerStats, score.composite)

  if (
    score.composite >= 88 &&
    peerTopTierWhenKnown(peerStats?.compositePct, 88)
  ) {
    candidates.push({ word: 'Rare', weight: score.composite })
  }

  return finalizeCandidates(candidates, score, pickMode)
}
