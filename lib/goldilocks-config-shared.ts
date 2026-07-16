import type { GoldilocksFactorKey } from '@/lib/goldilocks-score-info'

/** Factor keys in display / composite order. */
export const GOLDILOCKS_FACTOR_ORDER: GoldilocksFactorKey[] = [
  'age',
  'condition',
  'finishes',
  'ppsf',
  'layout',
  'schools',
]

/** Default composite weights (must sum to 1). */
export const DEFAULT_GOLDILOCKS_WEIGHTS: Record<GoldilocksFactorKey, number> = {
  age: 0.1,
  condition: 0.2,
  finishes: 0.25,
  ppsf: 0.25,
  layout: 0.1,
  schools: 0.1,
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

export type GoldilocksScoringConfig = {
  weights: GoldilocksWeights
  keywords: GoldilocksKeywordGroups
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
  reno: 'Remarks phrases that signal a renovated / move-in-ready home.',
  quality: 'Material & amenity phrases that raise finishes quality.',
  lowQuality: 'Phrases that pull finishes / condition down.',
  conditionDowngrade:
    'Distress language that lowers condition (and can pull fresh new-builds off 100).',
  goodLayout: 'Layout phrases that raise layout quality.',
  badLayout: 'Layout phrases that lower layout quality.',
  disqualifying:
    'If matched in remarks, the listing is filtered out of Deal Table shortlists (not the raw composite).',
}

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
  }

  const weights = { ...DEFAULT_GOLDILOCKS_WEIGHTS }
  if (body.weights && typeof body.weights === 'object') {
    for (const key of GOLDILOCKS_FACTOR_ORDER) {
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
    weights.schools = Math.round((weights.schools + drift) * 1000) / 1000
  }

  const keywords = cloneGoldilocksConfig().keywords
  if (body.keywords && typeof body.keywords === 'object') {
    for (const group of GOLDILOCKS_KEYWORD_GROUP_ORDER) {
      if (body.keywords[group] !== undefined) {
        keywords[group] = normalizeKeywordList(body.keywords[group])
      }
    }
  }

  return { ok: true, config: { weights, keywords } }
}
