/**
 * Luxury inventory helpers — defaults live in inventory-segment-bands-shared;
 * production charts read Admin/Postgres config via inventory-segment-bands-config.
 */

import {
  DEFAULT_LUXURY_STEPS,
  getInventorySegment,
  luxuryFloorFromConfig,
  luxuryStepsFromConfig,
  type InventorySegmentBandsConfig,
} from "@/lib/inventory-segment-bands-shared";
import {
  classifySalePrice,
  emptyPriceCounts,
  type PriceBucketDef,
  visiblePriceBuckets,
} from "@/lib/price-buckets-shared";

/** @deprecated Prefer luxuryFloorFromConfig(getInventorySegmentBandsConfig()). */
export const LUXURY_PRICE_FLOOR = 4_000_000;

/** Default fine buckets — Admin may override in Postgres. */
export const LUXURY_PRICE_BUCKETS: PriceBucketDef[] = DEFAULT_LUXURY_STEPS;

/**
 * Top N sale bands from Admin (highest min first), ascending for display.
 * Metadata only — fine chart steps come from inventory segment config.
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
  steps: readonly PriceBucketDef[] = LUXURY_PRICE_BUCKETS,
): string {
  return classifySalePrice(price, steps);
}

export function emptyLuxuryPriceCounts(
  steps: readonly PriceBucketDef[] = LUXURY_PRICE_BUCKETS,
): Record<string, number> {
  return emptyPriceCounts(steps);
}

export function resolveLuxuryInventoryBands(
  config: InventorySegmentBandsConfig,
): { floor: number; steps: PriceBucketDef[]; segmentLabel: string } {
  const luxury = getInventorySegment(config, "luxury");
  return {
    floor: luxuryFloorFromConfig(config),
    steps: luxuryStepsFromConfig(config),
    segmentLabel: luxury.label,
  };
}
