import { NextRequest, NextResponse } from "next/server";
import { readAllListingsFromDb, readListingsFromDb } from "@/lib/db/listings-repo";
import { listingCacheHeaders } from "@/lib/listings-store";
import {
  getInventorySegmentBandsConfigFresh,
} from "@/lib/inventory-segment-bands-config";
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
import {
  readStatsCache,
  scheduleStatsCacheRebuildIfStale,
  writeStatsCache,
} from "@/lib/stats-cache";
import { TMRE_TOWNS, isTmreTown } from "@/lib/tmre-towns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CachedSegment = ActiveBySegmentPricePayload & { generatedAt?: string };

function parseSegment(
  raw: string | null,
): InventorySegmentId | null {
  if (
    raw === "value" ||
    raw === "mid" ||
    raw === "luxury" ||
    raw === "discount"
  ) {
    return raw;
  }
  return null;
}

async function loadSegmentPayload(
  city: string,
  segmentId: InventorySegmentId,
): Promise<CachedSegment> {
  const scope = inventorySegmentStatsScope(segmentId);
  const cached = await readStatsCache<CachedSegment>(scope, city, "sale");
  if (cached?.buckets) {
    return {
      ...cached,
      segmentId: cached.segmentId ?? segmentId,
    };
  }

  scheduleStatsCacheRebuildIfStale(true);

  const active =
    city === "All"
      ? await readAllListingsFromDb(TMRE_TOWNS, "Active")
      : await readListingsFromDb(city, "Active", 500);

  const [saleBuckets, inventoryConfig] = await Promise.all([
    getPriceBucketsFresh(),
    getInventorySegmentBandsConfigFresh(),
  ]);
  const segment = inventoryConfig.segments.find((s) => s.id === segmentId)!;
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
  return { ...payload, generatedAt };
}

/**
 * Active inventory by Admin market band (value | mid | luxury | discount).
 * GET ?city=All&segment=luxury
 * GET ?city=All&all=1 — all market bands (for Intelligence prefetch).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") ?? "").trim();
  const wantAll = searchParams.get("all") === "1";
  const segmentParam = parseSegment(searchParams.get("segment"));

  if (!city) {
    return NextResponse.json(
      { error: 'city is required (town name or "All")' },
      { status: 400 },
    );
  }
  if (city !== "All" && !isTmreTown(city)) {
    return NextResponse.json(
      { error: `Unsupported city '${city}'` },
      { status: 400 },
    );
  }
  if (!wantAll && !segmentParam) {
    return NextResponse.json(
      {
        error:
          "segment is required (value | mid | luxury | discount), or pass all=1",
      },
      { status: 400 },
    );
  }

  try {
    if (wantAll) {
      const bySegment = {} as Record<InventorySegmentId, CachedSegment>;
      await Promise.all(
        INVENTORY_SEGMENT_IDS.map(async (id) => {
          bySegment[id] = await loadSegmentPayload(city, id);
        }),
      );
      return NextResponse.json(
        {
          city,
          bySegment,
          source: "db",
          generatedAt: new Date().toISOString(),
        },
        {
          headers: {
            ...listingCacheHeaders("db"),
            "X-Stats-Cache": "bundle",
          },
        },
      );
    }

    const payload = await loadSegmentPayload(city, segmentParam!);
    return NextResponse.json(
      { ...payload, source: "db", statsCache: true },
      {
        headers: {
          ...listingCacheHeaders("db"),
          "X-Stats-Cache": "hit-or-seed",
        },
      },
    );
  } catch (err) {
    console.error("[/api/active-by-segment-price] error", err);
    return NextResponse.json(
      { error: "Failed to load inventory by segment price" },
      { status: 502 },
    );
  }
}
