import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  cloneGoldilocksConfig,
  DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  normalizeGoldilocksConfig,
  type GoldilocksScoringConfig,
} from '@/lib/goldilocks-config-shared'

export const GOLDILOCKS_CONFIG_SYNC_KEY = 'goldilocks_scoring_config'

/** Fingerprint of the config that was last applied by a Goldilocks score rebuild. */
export const GOLDILOCKS_CONFIG_APPLIED_SYNC_KEY = 'goldilocks_scoring_config_applied'

/** Stable string for comparing saved config vs last rebuilt config. */
export function goldilocksConfigFingerprint(config: GoldilocksScoringConfig): string {
  return JSON.stringify(config)
}

export {
  DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  DEFAULT_GOLDILOCKS_WEIGHTS,
  DEFAULT_GOLDILOCKS_KEYWORDS,
  DEFAULT_GOLDILOCKS_DOM_TIERS,
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_LABELS,
  GOLDILOCKS_KEYWORD_GROUP_HINTS,
  cloneGoldilocksConfig,
  goldilocksWeightSum,
  normalizeGoldilocksConfig,
  scoreDomDays,
  type GoldilocksScoringConfig,
  type GoldilocksWeights,
  type GoldilocksKeywordGroups,
  type GoldilocksKeywordGroupId,
  type GoldilocksDomTier,
  type GoldilocksDomDayRange,
} from '@/lib/goldilocks-config-shared'

function parseConfig(raw: string | null): GoldilocksScoringConfig {
  if (!raw) return cloneGoldilocksConfig()
  try {
    const parsed = normalizeGoldilocksConfig(JSON.parse(raw))
    return parsed.ok ? parsed.config : cloneGoldilocksConfig()
  } catch {
    return cloneGoldilocksConfig()
  }
}

/** Synchronous read from the in-process sync_meta cache (may be stale on Lambda). */
export function getGoldilocksConfig(): GoldilocksScoringConfig {
  return parseConfig(getSyncMeta(GOLDILOCKS_CONFIG_SYNC_KEY))
}

/**
 * Authoritative read from Postgres. Use at the start of score rebuilds and any
 * path that must match what Admin just saved.
 */
export async function getGoldilocksConfigFresh(): Promise<GoldilocksScoringConfig> {
  try {
    return parseConfig(await getSyncMetaFresh(GOLDILOCKS_CONFIG_SYNC_KEY))
  } catch {
    return getGoldilocksConfig()
  }
}

/** Persist scoring config (durable) and return the normalized value stored. */
export async function setGoldilocksConfig(
  input: unknown,
): Promise<GoldilocksScoringConfig> {
  const normalized = normalizeGoldilocksConfig(input)
  if (!normalized.ok) throw new Error(normalized.error)
  await setSyncMetaDurable(
    GOLDILOCKS_CONFIG_SYNC_KEY,
    JSON.stringify(normalized.config),
  )
  return normalized.config
}

export function isDefaultGoldilocksConfig(config: GoldilocksScoringConfig): boolean {
  return (
    JSON.stringify(config) === JSON.stringify(DEFAULT_GOLDILOCKS_SCORING_CONFIG)
  )
}

/** Fingerprint stored when listing scores were last rebuilt with the live config. */
export async function getAppliedGoldilocksConfigFingerprint(): Promise<string | null> {
  try {
    const raw = await getSyncMetaFresh(GOLDILOCKS_CONFIG_APPLIED_SYNC_KEY)
    return raw?.trim() ? raw.trim() : null
  } catch {
    const cached = getSyncMeta(GOLDILOCKS_CONFIG_APPLIED_SYNC_KEY)
    return cached?.trim() ? cached.trim() : null
  }
}

/**
 * True when the saved scoring config (weights / characteristics / DOM) differs
 * from the config used for the last successful Goldilocks score rebuild.
 */
export async function goldilocksScoresNeedRebuild(
  config?: GoldilocksScoringConfig,
): Promise<boolean> {
  const live = config ?? (await getGoldilocksConfigFresh())
  const applied = await getAppliedGoldilocksConfigFingerprint()
  if (!applied) return true
  return applied !== goldilocksConfigFingerprint(live)
}

/** Record that stored listing scores now match the current saved config. */
export async function markGoldilocksConfigAppliedToScores(
  config?: GoldilocksScoringConfig,
): Promise<void> {
  const live = config ?? (await getGoldilocksConfigFresh())
  await setSyncMetaDurable(
    GOLDILOCKS_CONFIG_APPLIED_SYNC_KEY,
    goldilocksConfigFingerprint(live),
  )
}
