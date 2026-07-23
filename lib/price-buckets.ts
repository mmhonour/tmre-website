/**
 * Sale price bands for Stats charts.
 * Defaults + classify live here (client-safe). Admin overrides: price-buckets-config.
 */
export {
  PRICE_BUCKETS,
  DEFAULT_PRICE_BUCKETS,
  DEFAULT_PRICE_BUCKETS_CONFIG,
  classifySalePrice,
  emptyPriceCounts,
  clonePriceBucketsConfig,
  normalizePriceBucketsConfig,
  suggestPriceBucketId,
  isDefaultPriceBucketsConfig,
  type PriceBucket,
  type PriceBucketDef,
  type PriceBucketId,
  type PriceBucketsConfig,
} from '@/lib/price-buckets-shared'
