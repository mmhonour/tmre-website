/**
 * Fine price bands for the Intelligence luxury mini chart.
 * $4M–$10M in $1M steps; $10M+ in $5M steps.
 * Count source is Postgres actives via stats_cache (never RETS).
 */

import {
  classifySalePrice,
  emptyPriceCounts,
  type PriceBucketDef,
  visiblePriceBuckets,
} from "@/lib/price-buckets-shared";

export const LUXURY_PRICE_FLOOR = 4_000_000;

/** Fixed count buckets for the luxury inventory mini graph. */
export const LUXURY_PRICE_BUCKETS: PriceBucketDef[] = [
  { id: "lux-4-5m", label: "$4M–$5M", min: 4_000_000, max: 4_999_999 },
  { id: "lux-5-6m", label: "$5M–$6M", min: 5_000_000, max: 5_999_999 },
  { id: "lux-6-7m", label: "$6M–$7M", min: 6_000_000, max: 6_999_999 },
  { id: "lux-7-8m", label: "$7M–$8M", min: 7_000_000, max: 7_999_999 },
  { id: "lux-8-9m", label: "$8M–$9M", min: 8_000_000, max: 8_999_999 },
  { id: "lux-9-10m", label: "$9M–$10M", min: 9_000_000, max: 9_999_999 },
  { id: "lux-10-15m", label: "$10M–$15M", min: 10_000_000, max: 14_999_999 },
  { id: "lux-15-20m", label: "$15M–$20M", min: 15_000_000, max: 19_999_999 },
  { id: "lux-20-25m", label: "$20M–$25M", min: 20_000_000, max: 24_999_999 },
  { id: "lux-25-30m", label: "$25M–$30M", min: 25_000_000, max: 29_999_999 },
  { id: "lux-30m-plus", label: "$30M+", min: 30_000_000, max: null },
];

/**
 * Top N sale bands from Admin (highest min first), ascending for display.
 * These are the admin “luxury” Sales bands the luxury chart is keyed to.
 */
export function topLuxurySaleBands(
  saleBands: readonly PriceBucketDef[],
  n = 3,
): PriceBucketDef[] {
  return visiblePriceBuckets(saleBands)
    .slice()
    .sort(
      (a, b) =>
        b.min - a.min ||
        (b.max ?? Number.POSITIVE_INFINITY) -
          (a.max ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, n)
    .sort((a, b) => a.min - b.min || a.id.localeCompare(b.id))
    .map((b) => ({
      id: b.id,
      label: b.label,
      min: b.min,
      max: b.max,
      ...(b.hidden ? { hidden: true as const } : {}),
    }));
}

export function classifyLuxuryPrice(
  price: number | null | undefined,
): string {
  return classifySalePrice(price, LUXURY_PRICE_BUCKETS);
}

export function emptyLuxuryPriceCounts(): Record<string, number> {
  return emptyPriceCounts(LUXURY_PRICE_BUCKETS);
}
