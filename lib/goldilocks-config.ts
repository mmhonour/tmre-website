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

export {
  DEFAULT_GOLDILOCKS_SCORING_CONFIG,
  DEFAULT_GOLDILOCKS_WEIGHTS,
  DEFAULT_GOLDILOCKS_KEYWORDS,
  GOLDILOCKS_FACTOR_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_ORDER,
  GOLDILOCKS_KEYWORD_GROUP_LABELS,
  GOLDILOCKS_KEYWORD_GROUP_HINTS,
  cloneGoldilocksConfig,
  goldilocksWeightSum,
  normalizeGoldilocksConfig,
  type GoldilocksScoringConfig,
  type GoldilocksWeights,
  type GoldilocksKeywordGroups,
  type GoldilocksKeywordGroupId,
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
