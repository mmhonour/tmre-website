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
}

type Candidate = { word: string; weight: number }

const STRONG = 82

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

/** Pick a rehab synonym from listing language; never returns "Upgraded". */
function pickRehabSuperlative(text: string, seed?: string): string {
  if (/\brenovated?\b/.test(text)) return 'Renovated'
  if (/\bremodel(ed|ing)?\b/.test(text)) return 'Modernized'
  if (/\brehab(bed|bing)?\b/.test(text)) return 'Refreshed'
  if (/\brenew(ed|al)?\b/.test(text)) return 'Renewed'
  if (/\bupdated?\b/.test(text)) return 'Updated'

  const index = stableSynonymIndex(seed ?? text, REHAB_SYNONYMS.length)
  return REHAB_SYNONYMS[index]
}

/** 3–5 single-word tags explaining why a deal was selected. */
export function deriveDealSuperlatives(input: DealSuperlativeInput): string[] {
  const { score, listing, valueDiscountPct, pickMode, lotAcres } = input
  const candidates: Candidate[] = []
  const listingText = collectListingText(listing)

  if (valueDiscountPct != null && valueDiscountPct >= 10) {
    candidates.push({ word: 'Undervalued', weight: 100 + valueDiscountPct })
  } else if (
    pickMode === 'below-median' ||
    (valueDiscountPct != null && valueDiscountPct >= 3)
  ) {
    candidates.push({ word: 'Value', weight: 80 + (valueDiscountPct ?? 0) })
  }

  if (score.pricePerSqftFit >= 78) {
    candidates.push({ word: 'Value', weight: 70 + score.pricePerSqftFit * 0.25 })
  }

  if (listing.dom != null && listing.dom <= 7) {
    candidates.push({ word: 'Fresh', weight: 90 - listing.dom })
  }

  if (score.schoolRating >= STRONG) {
    candidates.push({ word: 'Schools', weight: score.schoolRating })
  }

  if (score.condition >= STRONG) {
    candidates.push({ word: 'Turnkey', weight: score.condition })
  }

  if (score.finishesQuality >= STRONG && hasRehabEvidence(listingText)) {
    candidates.push({
      word: pickRehabSuperlative(listingText, listing.mlsId),
      weight: score.finishesQuality,
    })
  }

  if (score.layoutQuality >= STRONG) {
    candidates.push({ word: 'Layout', weight: score.layoutQuality })
  }

  if (score.age >= STRONG) {
    candidates.push({ word: 'Modern', weight: score.age })
  }

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

  if (lotAcres != null && lotAcres >= 0.35) {
    candidates.push({ word: 'Spacious', weight: 60 + lotAcres * 20 })
  }

  if (score.composite >= 88) {
    candidates.push({ word: 'Rare', weight: score.composite })
  }

  const byWord = new Map<string, number>()
  for (const c of candidates) {
    byWord.set(c.word, Math.max(byWord.get(c.word) ?? 0, c.weight))
  }

  const ranked = [...byWord.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  if (ranked.length >= 3) return ranked.slice(0, 5)

  // Ensure at least three tags for thin profiles.
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
