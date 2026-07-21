import type { GoldilocksFactorKey } from '@/lib/goldilocks-score-info'

/** Factor keys in display / composite order. */
export const GOLDILOCKS_FACTOR_ORDER: GoldilocksFactorKey[] = [
  'age',
  'condition',
  'finishes',
  'ppsf',
  'layout',
  'schools',
  'dom',
]

/**
 * Default composite weights (must sum to 1).
 * DOM is 10%; finishes/PPSF/condition/age trimmed slightly vs the prior 6-factor mix.
 */
export const DEFAULT_GOLDILOCKS_WEIGHTS: Record<GoldilocksFactorKey, number> = {
  age: 0.08,
  condition: 0.18,
  finishes: 0.22,
  ppsf: 0.22,
  layout: 0.1,
  schools: 0.1,
  dom: 0.1,
}

export type GoldilocksKeywordGroupId =
  | 'reno'
  | 'quality'
  | 'lowQuality'
  | 'conditionDowngrade'
  | 'goodLayout'
  | 'badLayout'
  | 'disqualifying'

export type GoldilocksKeywordGroups = Record<GoldilocksKeywordGroupId, string[]>

export type GoldilocksWeights = Record<GoldilocksFactorKey, number>

/** Inclusive day range. `maxDays: null` means open-ended (e.g. 251+). */
export type GoldilocksDomDayRange = {
  minDays: number
  maxDays: number | null
}

/**
 * One DOM rating tier — day ranges that share a factor score.
 * First matching tier wins (order matters when ranges overlap).
 */
export type GoldilocksDomTier = {
  id: string
  label: string
  /** Factor score 0–100 when DOM falls in any of these ranges. */
  score: number
  ranges: GoldilocksDomDayRange[]
}

export type GoldilocksScoringConfig = {
  weights: GoldilocksWeights
  keywords: GoldilocksKeywordGroups
  /** Days-on-market rating bands (admin-editable). */
  domTiers: GoldilocksDomTier[]
  /** Neutral DOM factor score when listing DOM is missing. */
  domMissingScore: number
}

export const GOLDILOCKS_KEYWORD_GROUP_ORDER: GoldilocksKeywordGroupId[] = [
  'reno',
  'quality',
  'lowQuality',
  'conditionDowngrade',
  'goodLayout',
  'badLayout',
  'disqualifying',
]

export const GOLDILOCKS_KEYWORD_GROUP_LABELS: Record<
  GoldilocksKeywordGroupId,
  string
> = {
  reno: 'Renovation / condition uplift',
  quality: 'Finish quality (positive)',
  lowQuality: 'Finish quality (negative)',
  conditionDowngrade: 'Condition downgrade',
  goodLayout: 'Layout (positive)',
  badLayout: 'Layout (negative)',
  disqualifying: 'Disqualifying (board filter)',
}

export const GOLDILOCKS_KEYWORD_GROUP_HINTS: Record<
  GoldilocksKeywordGroupId,
  string
> = {
  reno: 'Remarks phrases that signal a renovated / move-in-ready home (whole-word match).',
  quality: 'Material & amenity phrases that raise finishes quality (whole-word match).',
  lowQuality:
    'Phrases that pull finishes / condition down (whole-word — “dated” will not match inside “updated”).',
  conditionDowngrade:
    'Distress language that lowers condition (and can pull fresh new-builds off 100). Whole-word match.',
  goodLayout: 'Layout phrases that raise layout quality (whole-word match).',
  badLayout: 'Layout phrases that lower layout quality (whole-word match).',
  disqualifying:
    'If matched as a whole phrase in remarks, the listing is filtered out of Deal Table shortlists (not the raw composite).',
}

/**
 * Default DOM tiers (highest → least).
 * Boundaries: sweet spot owns shared edges (75 and 180).
 */
export const DEFAULT_GOLDILOCKS_DOM_TIERS: GoldilocksDomTier[] = [
  {
    id: 'highest',
    label: 'Highest',
    score: 100,
    ranges: [{ minDays: 75, maxDays: 180 }],
  },
  {
    id: 'second',
    label: '2nd highest',
    score: 80,
    ranges: [
      { minDays: 60, maxDays: 74 },
      { minDays: 181, maxDays: 190 },
    ],
  },
  {
    id: 'fourth',
    label: '4th highest',
    score: 55,
    ranges: [
      { minDays: 30, maxDays: 59 },
      { minDays: 191, maxDays: 220 },
    ],
  },
  {
    id: 'fifth',
    label: '5th highest',
    score: 35,
    ranges: [
      { minDays: 0, maxDays: 29 },
      { minDays: 221, maxDays: 250 },
    ],
  },
  {
    id: 'lowest',
    label: 'Lowest',
    score: 15,
    ranges: [{ minDays: 251, maxDays: null }],
  },
]

export const DEFAULT_GOLDILOCKS_DOM_MISSING_SCORE = 50

/** Built-in keyword lists currently used by the scoring engine. */
export const DEFAULT_GOLDILOCKS_KEYWORDS: GoldilocksKeywordGroups = {
  reno: [
    'renovated',
    'updated',
    'new kitchen',
    'new bathrooms',
    'gut renovation',
    'fully remodeled',
    'brand new',
  ],
  quality: [
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
  ],
  lowQuality: ['carpet throughout', 'dated', 'original'],
  conditionDowngrade: [
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
  ],
  goodLayout: [
    'open floor plan',
    'en suite',
    'master suite',
    'family room',
    'finished basement',
    'great room',
  ],
  badLayout: ['galley kitchen', 'small bedrooms', 'steep stairs', 'narrow'],
  disqualifying: [
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
  ],
}

export const DEFAULT_GOLDILOCKS_SCORING_CONFIG: GoldilocksScoringConfig = {
  weights: { ...DEFAULT_GOLDILOCKS_WEIGHTS },
  keywords: {
    reno: [...DEFAULT_GOLDILOCKS_KEYWORDS.reno],
    quality: [...DEFAULT_GOLDILOCKS_KEYWORDS.quality],
    lowQuality: [...DEFAULT_GOLDILOCKS_KEYWORDS.lowQuality],
    conditionDowngrade: [...DEFAULT_GOLDILOCKS_KEYWORDS.conditionDowngrade],
    goodLayout: [...DEFAULT_GOLDILOCKS_KEYWORDS.goodLayout],
    badLayout: [...DEFAULT_GOLDILOCKS_KEYWORDS.badLayout],
    disqualifying: [...DEFAULT_GOLDILOCKS_KEYWORDS.disqualifying],
  },
  domTiers: DEFAULT_GOLDILOCKS_DOM_TIERS.map((tier) => ({
    ...tier,
    ranges: tier.ranges.map((r) => ({ ...r })),
  })),
  domMissingScore: DEFAULT_GOLDILOCKS_DOM_MISSING_SCORE,
}

export function cloneGoldilocksConfig(
  config: GoldilocksScoringConfig = DEFAULT_GOLDILOCKS_SCORING_CONFIG,
): GoldilocksScoringConfig {
  return {
    weights: { ...config.weights },
    keywords: {
      reno: [...config.keywords.reno],
      quality: [...config.keywords.quality],
      lowQuality: [...config.keywords.lowQuality],
      conditionDowngrade: [...config.keywords.conditionDowngrade],
      goodLayout: [...config.keywords.goodLayout],
      badLayout: [...config.keywords.badLayout],
      disqualifying: [...config.keywords.disqualifying],
    },
    domTiers: (config.domTiers ?? DEFAULT_GOLDILOCKS_DOM_TIERS).map((tier) => ({
      id: tier.id,
      label: tier.label,
      score: tier.score,
      ranges: tier.ranges.map((r) => ({
        minDays: r.minDays,
        maxDays: r.maxDays,
      })),
    })),
    domMissingScore:
      config.domMissingScore ?? DEFAULT_GOLDILOCKS_DOM_MISSING_SCORE,
  }
}

/** Sum of weights as a fraction (expect ≈ 1). */
export function goldilocksWeightSum(weights: GoldilocksWeights): number {
  return GOLDILOCKS_FACTOR_ORDER.reduce((sum, key) => sum + (weights[key] ?? 0), 0)
}

export function normalizeKeywordList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().toLowerCase()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

function normalizeDomDayRange(
  input: unknown,
): GoldilocksDomDayRange | null {
  if (!input || typeof input !== 'object') return null
  const row = input as { minDays?: unknown; maxDays?: unknown }
  const minDays = typeof row.minDays === 'number' ? row.minDays : Number(row.minDays)
  if (!Number.isFinite(minDays) || minDays < 0) return null
  let maxDays: number | null
  if (row.maxDays == null || row.maxDays === '') {
    maxDays = null
  } else {
    const maxN = typeof row.maxDays === 'number' ? row.maxDays : Number(row.maxDays)
    if (!Number.isFinite(maxN) || maxN < minDays) return null
    maxDays = Math.round(maxN)
  }
  return { minDays: Math.round(minDays), maxDays }
}

export function normalizeDomTiers(input: unknown):
  | { ok: true; tiers: GoldilocksDomTier[] }
  | { ok: false; error: string } {
  if (input == null) {
    return {
      ok: true,
      tiers: DEFAULT_GOLDILOCKS_DOM_TIERS.map((tier) => ({
        ...tier,
        ranges: tier.ranges.map((r) => ({ ...r })),
      })),
    }
  }
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'DOM tiers must be a non-empty list' }
  }
  const tiers: GoldilocksDomTier[] = []
  for (let i = 0; i < input.length; i++) {
    const raw = input[i]
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `DOM tier ${i + 1} is invalid` }
    }
    const row = raw as {
      id?: unknown
      label?: unknown
      score?: unknown
      ranges?: unknown
    }
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `tier-${i + 1}`
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : `Tier ${i + 1}`
    const scoreN = typeof row.score === 'number' ? row.score : Number(row.score)
    if (!Number.isFinite(scoreN) || scoreN < 0 || scoreN > 100) {
      return {
        ok: false,
        error: `DOM tier “${label}” score must be 0–100`,
      }
    }
    if (!Array.isArray(row.ranges) || row.ranges.length === 0) {
      return {
        ok: false,
        error: `DOM tier “${label}” needs at least one day range`,
      }
    }
    const ranges: GoldilocksDomDayRange[] = []
    for (const rangeRaw of row.ranges) {
      const range = normalizeDomDayRange(rangeRaw)
      if (!range) {
        return {
          ok: false,
          error: `DOM tier “${label}” has an invalid day range`,
        }
      }
      ranges.push(range)
    }
    tiers.push({ id, label, score: clampScore(scoreN), ranges })
  }
  return { ok: true, tiers }
}

/** Score DOM days against ordered tiers (first match wins). */
export function scoreDomDays(
  dom: number | null | undefined,
  tiers: GoldilocksDomTier[],
  missingScore: number = DEFAULT_GOLDILOCKS_DOM_MISSING_SCORE,
): number {
  if (dom == null || !Number.isFinite(dom) || dom < 0) {
    return clampScore(missingScore)
  }
  const days = Math.round(dom)
  for (const tier of tiers) {
    for (const range of tier.ranges) {
      if (days < range.minDays) continue
      if (range.maxDays == null || days <= range.maxDays) {
        return clampScore(tier.score)
      }
    }
  }
  // Fallback if gaps exist in configured ranges — treat as lowest tier score.
  const last = tiers[tiers.length - 1]
  return clampScore(last?.score ?? missingScore)
}

/**
 * Coerce/validate a partial admin payload into a full scoring config.
 * Returns `{ ok: false, error }` when weights are out of range or do not sum to 1.
 */
export function normalizeGoldilocksConfig(input: unknown):
  | { ok: true; config: GoldilocksScoringConfig }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid config payload' }
  }
  const body = input as {
    weights?: Partial<Record<string, unknown>>
    keywords?: Partial<Record<string, unknown>>
    domTiers?: unknown
    domMissingScore?: unknown
  }

  const weights = { ...DEFAULT_GOLDILOCKS_WEIGHTS }
  const hadDomWeight =
    body.weights != null &&
    typeof body.weights === 'object' &&
    body.weights.dom !== undefined &&
    body.weights.dom !== null &&
    body.weights.dom !== ''

  if (body.weights && typeof body.weights === 'object') {
    for (const key of GOLDILOCKS_FACTOR_ORDER) {
      if (body.weights[key] === undefined || body.weights[key] === null) continue
      const raw = body.weights[key]
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return {
          ok: false,
          error: `Weight for ${key} must be a number between 0 and 1`,
        }
      }
      weights[key] = Math.round(n * 1000) / 1000
    }
  }

  // Migrate pre-DOM configs: six weights that already sum to ~1, plus default DOM.
  if (!hadDomWeight) {
    const nonDomKeys = GOLDILOCKS_FACTOR_ORDER.filter((k) => k !== 'dom')
    const nonDomSum = nonDomKeys.reduce((s, k) => s + weights[k], 0)
    if (Math.abs(nonDomSum - 1) <= 0.02) {
      const target = 1 - weights.dom
      if (nonDomSum > 0) {
        for (const key of nonDomKeys) {
          weights[key] =
            Math.round(((weights[key] / nonDomSum) * target) * 1000) / 1000
        }
      }
    }
  }

  const sum = goldilocksWeightSum(weights)
  if (Math.abs(sum - 1) > 0.001) {
    return {
      ok: false,
      error: `Weights must sum to 100% (currently ${Math.round(sum * 1000) / 10}%)`,
    }
  }

  // Nudge tiny float drift so stored weights always sum exactly to 1.
  const drift = 1 - goldilocksWeightSum(weights)
  if (Math.abs(drift) > 0 && Math.abs(drift) <= 0.001) {
    weights.dom = Math.round((weights.dom + drift) * 1000) / 1000
  }

  const keywords = cloneGoldilocksConfig().keywords
  if (body.keywords && typeof body.keywords === 'object') {
    for (const group of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      if (body.keywords[group] !== undefined) {
        keywords[group] = normalizeKeywordList(body.keywords[group])
      }
    }
  }

  const tiersResult = normalizeDomTiers(body.domTiers)
  if (!tiersResult.ok) return tiersResult

  let domMissingScore = DEFAULT_GOLDILOCKS_DOM_MISSING_SCORE
  if (body.domMissingScore !== undefined && body.domMissingScore !== null) {
    const n =
      typeof body.domMissingScore === 'number'
        ? body.domMissingScore
        : Number(body.domMissingScore)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return {
        ok: false,
        error: 'Missing-DOM score must be a number between 0 and 100',
      }
    }
    domMissingScore = clampScore(n)
  }

  return {
    ok: true,
    config: {
      weights,
      keywords,
      domTiers: tiersResult.tiers,
      domMissingScore,
    },
  }
}
