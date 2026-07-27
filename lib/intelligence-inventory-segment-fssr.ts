import "server-only";

import { readAllListingsFromDb } from "@/lib/db/listings-repo";
import { getInventorySegmentBandsConfigFresh } from "@/lib/inventory-segment-bands-config";
import {
  INVENTORY_SEGMENT_IDS,
  type InventorySegmentId,
} from "@/lib/inventory-segment-bands-shared";
import { getPriceBucketsFresh } from "@/lib/price-buckets-config";
import {
  computeActiveBySegmentPrice,
  inventorySegmentStatsScope,
  type ActiveBySegmentPricePayload,
} from "@/lib/stats-compute";
import { readStatsCache, writeStatsCache } from "@/lib/stats-cache";
import { TMRE_TOWNS } from "@/lib/tmre-towns";

export type InventorySegmentChartBucket = {
  id: string;
  label: string;
  count: number;
  min: number;
  max: number | null;
};

export type InventorySegmentChartSeed = {
  city: string;
  bySegment: Record<
    InventorySegmentId,
    {
      segmentId: InventorySegmentId;
      segmentLabel: string;
      buckets: InventorySegmentChartBucket[];
    }
  >;
};

/**
 * SSR seed for Intelligence inventory-by-price chart — all Admin Market Bands
 * for city "All", from stats_cache (seed on miss).
 */
export async function loadInventorySegmentChartSeed(
  city = "All",
): Promise<InventorySegmentChartSeed | null> {
  try {
    const [saleBuckets, inventoryConfig] = await Promise.all([
      getPriceBucketsFresh(),
      getInventorySegmentBandsConfigFresh(),
    ]);

    let active: Awaited<ReturnType<typeof readAllListingsFromDb>> | null = null;
    const bySegment = {} as InventorySegmentChartSeed["bySegment"];

    for (const id of INVENTORY_SEGMENT_IDS) {
      const scope = inventorySegmentStatsScope(id);
      const cached = await readStatsCache<ActiveBySegmentPricePayload>(
        scope,
        city,
        "sale",
      );
      if (cached?.buckets?.length) {
        bySegment[id] = {
          segmentId: id,
          segmentLabel: cached.segmentLabel ?? id,
          buckets: cached.buckets.map((b) => ({
            id: b.id,
            label: b.label,
            count: b.count,
            min: b.min,
            max: b.max,
          })),
        };
        continue;
      }

      if (!active) {
        active = await readAllListingsFromDb(TMRE_TOWNS, "Active");
      }
      const segment = inventoryConfig.segments.find((s) => s.id === id)!;
      const payload = computeActiveBySegmentPrice(
        active,
        city,
        {
          id: segment.id,
          label: segment.label,
          min: segment.min,
          max: segment.max,
          steps: segment.steps.filter((b) => !b.hidden),
        },
        saleBuckets,
      );
      const generatedAt = new Date().toISOString();
      await writeStatsCache(scope, city, "sale", { ...payload, generatedAt });
      bySegment[id] = {
        segmentId: id,
        segmentLabel: payload.segmentLabel,
        buckets: payload.buckets.map((b) => ({
          id: b.id,
          label: b.label,
          count: b.count,
          min: b.min,
          max: b.max,
        })),
      };
    }

    return { city, bySegment };
  } catch (err) {
    console.warn("[intelligence-inventory-segment-fssr]", err);
    return null;
  }
}
