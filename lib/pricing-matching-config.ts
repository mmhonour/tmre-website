import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  clonePricingMatchingConfig,
  DEFAULT_PRICING_MATCHING_CONFIG,
  normalizePricingMatchingConfig,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config-shared'

export const PRICING_MATCHING_CONFIG_SYNC_KEY = 'pricing_matching_config'

export {
  DEFAULT_PRICING_MATCHING_CONFIG,
  PRICING_MATCHING_FIELD_META,
  clonePricingMatchingConfig,
  isDefaultPricingMatchingConfig,
  normalizePricingMatchingConfig,
  pricingMatchingConfigFingerprint,
  type PricingMatchingConfig,
} from '@/lib/pricing-matching-config-shared'

function parseConfig(raw: string | null): PricingMatchingConfig {
  if (!raw) return clonePricingMatchingConfig()
  try {
    const parsed = normalizePricingMatchingConfig(JSON.parse(raw))
    return parsed.ok ? parsed.config : clonePricingMatchingConfig()
  } catch {
    return clonePricingMatchingConfig()
  }
}

/** Synchronous read from the in-process sync_meta cache (may be stale on Lambda). */
export function getPricingMatchingConfig(): PricingMatchingConfig {
  return parseConfig(getSyncMeta(PRICING_MATCHING_CONFIG_SYNC_KEY))
}

/**
 * Authoritative read from Postgres. Use at the start of comparable / What if
 * resolves so Admin saves apply without a redeploy.
 */
export async function getPricingMatchingConfigFresh(): Promise<PricingMatchingConfig> {
  try {
    return parseConfig(await getSyncMetaFresh(PRICING_MATCHING_CONFIG_SYNC_KEY))
  } catch {
    return getPricingMatchingConfig()
  }
}

/** Persist matching config (durable) and return the normalized value stored. */
export async function setPricingMatchingConfig(
  input: unknown,
): Promise<PricingMatchingConfig> {
  const normalized = normalizePricingMatchingConfig(input)
  if (!normalized.ok) throw new Error(normalized.error)
  await setSyncMetaDurable(
    PRICING_MATCHING_CONFIG_SYNC_KEY,
    JSON.stringify(normalized.config),
  )
  return normalized.config
}
