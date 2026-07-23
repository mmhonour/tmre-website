import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  clonePriceBucketsConfig,
  DEFAULT_PRICE_BUCKETS,
  DEFAULT_PRICE_BUCKETS_CONFIG,
  isDefaultPriceBucketsConfig,
  normalizePriceBucketsConfig,
  type PriceBucketDef,
  type PriceBucketsConfig,
} from '@/lib/price-buckets-shared'

export const PRICE_BUCKETS_CONFIG_SYNC_KEY = 'stats_sale_price_buckets'

export {
  DEFAULT_PRICE_BUCKETS,
  DEFAULT_PRICE_BUCKETS_CONFIG,
  isDefaultPriceBucketsConfig,
  clonePriceBucketsConfig,
  type PriceBucketDef,
  type PriceBucketsConfig,
}

function parseConfig(raw: string | null): PriceBucketsConfig {
  if (!raw) return clonePriceBucketsConfig()
  try {
    const parsed = normalizePriceBucketsConfig(JSON.parse(raw))
    return parsed.ok ? parsed.config : clonePriceBucketsConfig()
  } catch {
    return clonePriceBucketsConfig()
  }
}

/** Sync read from in-process sync_meta cache. */
export function getPriceBucketsConfig(): PriceBucketsConfig {
  return parseConfig(getSyncMeta(PRICE_BUCKETS_CONFIG_SYNC_KEY))
}

export function getPriceBuckets(): PriceBucketDef[] {
  return getPriceBucketsConfig().sale
}

/** Authoritative Postgres read. */
export async function getPriceBucketsConfigFresh(): Promise<PriceBucketsConfig> {
  try {
    return parseConfig(await getSyncMetaFresh(PRICE_BUCKETS_CONFIG_SYNC_KEY))
  } catch {
    return getPriceBucketsConfig()
  }
}

export async function getPriceBucketsFresh(): Promise<PriceBucketDef[]> {
  return (await getPriceBucketsConfigFresh()).sale
}

export async function setPriceBucketsConfig(
  input: unknown,
): Promise<PriceBucketsConfig> {
  const normalized = normalizePriceBucketsConfig(input)
  if (!normalized.ok) throw new Error(normalized.error)
  await setSyncMetaDurable(
    PRICE_BUCKETS_CONFIG_SYNC_KEY,
    JSON.stringify(normalized.config),
  )
  return normalized.config
}
